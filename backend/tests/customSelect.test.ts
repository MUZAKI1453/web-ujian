import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { nextOption, optionScrollTop, readOptions } from '../../frontend/src/components/ui/selectOptions';

test('dropdown navigation scrolls only the option list and leaves visible options in place', () => {
    const viewport = { top: 300, bottom: 500 };
    assert.equal(optionScrollTop(80, viewport, { top: 320, bottom: 364 }), 80);
    assert.equal(optionScrollTop(80, viewport, { top: 300, bottom: 500 }), 80);
    assert.equal(optionScrollTop(80, viewport, { top: 280, bottom: 324 }), 60);
    assert.equal(optionScrollTop(80, viewport, { top: 480, bottom: 524 }), 104);
    assert.equal(optionScrollTop(0, viewport, { top: 250, bottom: 294 }), 0);
    // Moving the page or opening the menu above its trigger does not change the list's relative scroll.
    assert.equal(optionScrollTop(80, { top: 100, bottom: 300 }, { top: 280, bottom: 324 }), 104);
});

test('custom dropdown preserves form values, conditional options, and disabled assignments', () => {
    const options = readOptions([
        createElement('option', { value: '' }, 'Semua Mapel'),
        createElement(Fragment, null,
            createElement('option', { value: 0 }, 'Nomor nol'),
            createElement('option', { value: 12, disabled: true }, 'Sudah diampu')),
        false,
        [createElement('option', { value: 'false' }, 'Salah')],
        createElement('option', null, 'Terjadwal')
    ]);
    assert.deepEqual(options, [
        { value: '', label: 'Semua Mapel', disabled: false },
        { value: '0', label: 'Nomor nol', disabled: false },
        { value: '12', label: 'Sudah diampu', disabled: true },
        { value: 'false', label: 'Salah', disabled: false },
        { value: 'Terjadwal', label: 'Terjadwal', disabled: false }
    ]);
});

test('dropdown keyboard navigation skips disabled choices and handles empty search results', () => {
    const options = readOptions([
        createElement('option', { value: 'a', disabled: true }, 'A'),
        createElement('option', { value: 'b' }, 'B'),
        createElement('option', { value: 'c', disabled: true }, 'C'),
        createElement('option', { value: 'd' }, 'D')
    ]);
    assert.equal(nextOption(options, -1, 'ArrowDown'), 1);
    assert.equal(nextOption(options, -1, 'ArrowUp'), 3);
    assert.equal(nextOption(options, 1, 'ArrowDown'), 3);
    assert.equal(nextOption(options, 3, 'ArrowDown'), 1);
    assert.equal(nextOption(options, 1, 'ArrowUp'), 3);
    assert.equal(nextOption(options, 3, 'Home'), 1);
    assert.equal(nextOption(options, 1, 'End'), 3);
    assert.equal(nextOption([], -1, 'ArrowDown'), -1);
    assert.equal(nextOption(options.filter(option => option.disabled), -1, 'Home'), -1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { nextOption, readOptions } from '../../frontend/src/components/ui/selectOptions';

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

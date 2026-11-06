import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correctionInput, essayMarks } from '../../frontend/src/pages/guru/correctionForm';

test('separate short answer boxes preserve all alternatives for the correction API', () => {
    const form = new FormData();
    [' Jakarta ', '', 'DKI Jakarta', '1,5', '1.5'].forEach(value => form.append('jawaban', value));
    assert.equal(correctionInput('ISIAN', 0, form), 'Jakarta\nDKI Jakarta\n1,5\n1.5');
});

test('key corrections retain option ordering and false statement answers', () => {
    const form = new FormData();
    form.append('item-0', 'false'); form.append('item-1', 'true'); form.append('item-2', 'false');
    for (const type of ['PG', 'PM', 'BS']) assert.deepEqual(correctionInput(type, 3, form), [false, true, false]);
});

test('essay grading saves zero, changed notes and scores across tabs while skipping untouched blanks', () => {
    const form = new FormData();
    form.append('nilai-1', '0'); form.append('catatan-1', ' Perlu diperbaiki ');
    form.append('nilai-2', '3'); form.append('catatan-2', 'Revisi catatan');
    form.append('nilai-3', ''); form.append('nilai-4', '5');
    assert.deepEqual(essayMarks([{ id: 1, nilai: null }, { id: 2, nilai: 3, catatan: 'Catatan lama' }, { id: 3, nilai: null }, { id: 4, nilai: 5 }], form), [
        { soalId: 1, nilai: 0, catatan: 'Perlu diperbaiki' }, { soalId: 2, nilai: 3, catatan: 'Revisi catatan' }
    ]);
});

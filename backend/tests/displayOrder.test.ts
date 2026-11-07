import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareNames, sortByName } from '../src/controllers/displayOrder';

test('class names use natural numeric order instead of creation or lexical order', () => {
    const classes = ['12B', '10A', '7B', '12A', '8A', '7A', '9A'].map((namaKelas, id) => ({ id, namaKelas }));
    assert.deepEqual(sortByName(classes, item => item.namaKelas).map(item => item.namaKelas), ['7A', '7B', '8A', '9A', '10A', '12A', '12B']);
    assert.ok(compareNames('7A2', '7A10') < 0);
});

test('student, teacher and subject names sort A to Z independent of capitalization and surrounding whitespace', () => {
    for (const names of [['Zahra', 'budi', ' Ahmad', 'Siti'], ['Matematika', 'IPA', ' bahasa Indonesia ', 'Agama']]) {
        const records = names.map((nama, index) => ({ id: 20 - index, nama }));
        const original = [...records];
        const sorted = sortByName(records, item => item.nama);
        assert.equal(sorted[0].nama.trim(), names[0] === 'Zahra' ? 'Ahmad' : 'Agama');
        assert.equal(sorted[sorted.length - 1].nama.trim(), names[0] === 'Zahra' ? 'Zahra' : 'Matematika');
        assert.deepEqual(records, original);
        assert.equal(compareNames(' ahmad ', 'AHMAD'), 0);
    }
});

test('matching names have stable ID order and blank names appear last', () => {
    const records = [{ id: 9, nama: 'Siti' }, { id: 4, nama: 'siti' }, { id: 1, nama: null }, { id: 2, nama: ' ' }];
    assert.deepEqual(sortByName(records, item => item.nama).map(item => item.id), [4, 9, 1, 2]);
});

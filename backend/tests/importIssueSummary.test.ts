import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeImportIssues } from '../src/controllers/importIssueSummary';

test('repeated missing classes are grouped while retaining their actual Excel rows', () => {
    assert.deepEqual(summarizeImportIssues([
        { row: 12, message: 'Kelas "10" belum terdaftar.' },
        { row: 13, message: 'Kelas "10" belum terdaftar.' },
        { row: 14, message: 'Kelas "10" belum terdaftar.' },
        { row: 15, message: 'Kelas "11" belum terdaftar.' },
        { row: 16, message: 'Kelas "12" belum terdaftar.' },
        { row: 20, message: 'Kelas "10" belum terdaftar.' }
    ]), ['Kelas "10" belum terdaftar — baris 12–14, 20.', 'Kelas "11" belum terdaftar — baris 15.', 'Kelas "12" belum terdaftar — baris 16.']);
});

test('long row lists are bounded and count the remaining affected rows accurately', () => {
    const issues = Array.from({ length: 11 }, (_, index) => ({ row: 12 + index * 2, message: 'Nama kelas kosong.' }));
    assert.deepEqual(summarizeImportIssues(issues), ['Nama kelas kosong — baris 12, 14, 16, 18, 20, 22, 24, 26, dan 3 baris lainnya.']);
});

test('only omitted issue groups contribute to the extra-row count', () => {
    const issues = Array.from({ length: 6 }, (_, index) => ({ row: 12 + index, message: 'Masalah ' + index + '.' }));
    issues.push({ row: 20, message: 'Masalah 5.' });
    const summary = summarizeImportIssues(issues);
    assert.equal(summary.length, 6);
    assert.equal(summary[5], '2 baris lainnya memiliki kesalahan berbeda.');
    assert.deepEqual(summarizeImportIssues([]), []);
});

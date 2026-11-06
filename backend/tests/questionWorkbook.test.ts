import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { questionTemplate, readQuestionWorkbook } from '../src/routes/questionWorkbook';

async function editedTemplate(edit: (book: XLSX.WorkBook) => void) {
    const book = XLSX.read(await questionTemplate(), { type: 'buffer' });
    edit(book);
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

test('horizontal template has five named tables and imports all five question types', async () => {
    const buffer = await questionTemplate();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as any);
    assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Pilihan Ganda', 'Pilihan Majemuk', 'Benar atau Salah', 'Isian Singkat', 'Esai']);
    for (const sheet of book.worksheets) {
        assert.equal(sheet.pageSetup.orientation, 'landscape');
        assert.equal(sheet.getCell('C11').value, 'Pertanyaan');
        assert.equal(sheet.getTables().length, 1);
        assert.equal(sheet.views[0].state, 'frozen');
    }
    const rows = readQuestionWorkbook(buffer);
    assert.deepEqual(rows.map(row => row.question.tipeSoal), ['PG', 'PM', 'BS', 'ISIAN', 'ESSAY']);
    assert.ok(rows.every(row => row.row === 12 && row.sheet));
    assert.deepEqual(rows[0].question.items.map(item => item.benar), [true, false, false, false]);
    assert.deepEqual(rows[1].question.items.map(item => item.benar), [true, false, true, false]);
    assert.deepEqual(rows[2].question.items.map(item => item.benar), [true, false]);
    assert.deepEqual(rows[3].question.jawaban, ['1,5', '1.5']);
    assert.equal(rows[3].question.angka, true);
    assert.equal(rows[4].question.poin, 6);
});

test('empty sheets are skipped, rows after the example are imported, and keys survive unused options', async () => {
    const buffer = await editedTemplate(book => {
        for (const name of book.SheetNames) {
            const sheet = book.Sheets[name];
            for (const cell of Object.keys(sheet)) if (/^[A-Z]+12$/.test(cell) && !cell.startsWith('B')) delete sheet[cell];
        }
        XLSX.utils.sheet_add_aoa(book.Sheets['Pilihan Ganda'], [[2, 'Pilih angka dua.', '1', '', '2', '', '', 'C']], { origin: 'B13' });
    });
    const rows = readQuestionWorkbook(buffer);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].row, 13);
    assert.deepEqual(rows[0].question.items, [{ teks: '1', benar: false }, { teks: '2', benar: true }]);
});

test('invalid answers report the sheet and row', async () => {
    const cases: [string, string, string | number, RegExp][] = [
        ['Pilihan Ganda', 'I12', 'A,C', /tepat satu/],
        ['Pilihan Ganda', 'I12', 'E', /opsi yang terisi/],
        ['Pilihan Majemuk', 'I12', 'A,A', /tanpa pengulangan/],
        ['Pilihan Majemuk', 'I12', 'A', /minimal dua/],
        ['Benar atau Salah', 'E12', '', /Benar atau Salah/],
        ['Isian Singkat', 'G12', 'mungkin', /Ya atau Tidak/],
        ['Esai', 'D12', 101, /1–100/],
        ['Esai', 'D12', 1.5, /1–100/],
        ['Pilihan Ganda', 'C12', '', /Pertanyaan wajib/]
    ];
    for (const [sheet, address, value, message] of cases) {
        const buffer = await editedTemplate(book => {
            book.Sheets[sheet][address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
        });
        assert.throws(() => readQuestionWorkbook(buffer), error => error instanceof Error && error.message.includes('Sheet ' + sheet + ', baris 12:') && message.test(error.message));
    }
});

test('empty workbooks and changed headers are rejected', async () => {
    const empty = await editedTemplate(book => {
        for (const name of book.SheetNames) for (const cell of Object.keys(book.Sheets[name])) if (/^[A-Z]+12$/.test(cell)) delete book.Sheets[name][cell];
    });
    assert.throws(() => readQuestionWorkbook(empty), /minimal satu soal/);
    const badHeader = await editedTemplate(book => { book.Sheets['Esai'].C11.v = 'Teks'; });
    assert.throws(() => readQuestionWorkbook(badHeader), /Sheet Esai.*baris 11/);
});

test('legacy vertical workbooks still import', () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
        ['bagian', 'isi', 'kunci'], ['tipe', 'PG'], ['soal', 'Satu ditambah satu?'],
        ['opsi', '2', 'benar'], ['opsi', '3', 'salah']
    ]), 'Soal');
    const rows = readQuestionWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].question.tipeSoal, 'PG');
    assert.equal(rows[0].question.items[0].benar, true);
});

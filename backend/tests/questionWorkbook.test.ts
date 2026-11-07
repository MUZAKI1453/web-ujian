import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { questionTemplate, readQuestionWorkbook } from '../src/routes/questionWorkbook';

const examples: Record<string, (string | number)[]> = {
    'Pilihan Ganda': [1, 'Berapakah 2 + 3?', '5', '6', '7', '8', '', 'A'],
    'Pilihan Majemuk': [1, 'Pilih bilangan genap.', '2', '3', '4', '5', '', 'A,C'],
    'Benar atau Salah': [1, 'Tentukan benar atau salah.', '5 lebih besar dari 3.', 'Benar', '2 ganjil.', 'Salah'],
    'Isian Singkat': [1, 'Berapa hasil 3 dibagi 2?', '1,5', '1.5', '', 'Ya'],
    Esai: [1, 'Jelaskan perbedaan ganjil dan genap.', 6, 'Beri poin untuk penjelasan dan contoh.']
};

function fillExample(book: XLSX.WorkBook, name: string) {
    XLSX.utils.sheet_add_aoa(book.Sheets[name], [examples[name]], { origin: 'B12' });
}

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
        assert.equal(sheet.views[0].state, 'normal');
    }
    assert.throws(() => readQuestionWorkbook(buffer), /minimal satu soal/);
    const [pg, pm, bs, isian, essay] = book.worksheets;
    assert.equal(pg.getCell('I511').dataValidation.formulae[0], '"A,B,C,D,E"');
    assert.equal(pm.getCell('I12').dataValidation.formulae[0], '$J$1:$J$26');
    assert.equal(pm.getColumn('J').hidden, true);
    assert.equal(pm.getCell('J1').value, 'A,B');
    for (const address of ['E12', 'G12', 'I12', 'K12', 'M12']) {
        assert.equal(bs.getCell(address).dataValidation.formulae[0], '"Benar,Salah"');
    }
    assert.equal(isian.getCell('G12').dataValidation.formulae[0], '"Ya,Tidak"');
    assert.equal(essay.getCell('D12').dataValidation.type, 'whole');
    assert.deepEqual(essay.getCell('D12').dataValidation.formulae, [1, 100]);

    const edited = await editedTemplate(file => file.SheetNames.forEach(name => fillExample(file, name)));
    const rows = readQuestionWorkbook(edited);
    assert.deepEqual(rows.map(row => row.question.tipeSoal), ['PG', 'PM', 'BS', 'ISIAN', 'ESSAY']);
    assert.ok(rows.every(row => row.row === 12 && row.sheet));
    assert.deepEqual(rows[0].question.items.map(item => item.benar), [true, false, false, false]);
    assert.deepEqual(rows[1].question.items.map(item => item.benar), [true, false, true, false]);
    assert.deepEqual(rows[2].question.items.map(item => item.benar), [true, false]);
    assert.deepEqual(rows[3].question.jawaban, ['1,5', '1.5']);
    assert.equal(rows[3].question.angka, true);
    assert.equal(rows[4].question.poin, 6);
});

test('empty sheets are skipped, later rows are imported, and keys survive unused options', async () => {
    const buffer = await editedTemplate(book => {
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
            fillExample(book, sheet);
            book.Sheets[sheet][address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
        });
        assert.throws(() => readQuestionWorkbook(buffer), error => error instanceof Error && error.message.includes('Sheet ' + sheet + ', baris 12:') && message.test(error.message));
    }
});

test('empty workbooks and changed headers are rejected', async () => {
    const empty = await questionTemplate();
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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { examReportWorkbook } from '../src/excel/examReportWorkbook';

for (const [logo, level, filename] of [
    ['smpip', 'SMP', 'logo_smpip.png'],
    ['smaip', 'SMA', 'Logo_smaip.png']
] as const) {
    test(`grade report uses the ${level} letterhead and keeps student IDs as text`, async () => {
        const workbook = new ExcelJS.Workbook();
        const buffer = await examReportWorkbook('Sumatif Akhir Semester', [
            { nis: '0012345', nama: 'Siswa Uji', poinOtomatis: 75, poinEssay: 12.5, total: 87.5, status: 'Selesai' }
        ], logo);
        await workbook.xlsx.load(buffer as any);
        const sheet = workbook.getWorksheet('Rekap Nilai')!;
        assert.equal(sheet.getCell('B1').value, 'YAYASAN PENDIDIKAN ISLAM BAITUSSALAM');
        assert.equal(sheet.getCell('B2').value, level + ' ISLAM PLUS BAITUSSALAM');
        assert.equal(sheet.getCell('B3').value, 'REKAP NILAI UJIAN');
        assert.equal(sheet.getCell('B6').value, 'Sumatif Akhir Semester');
        assert.equal(sheet.getCell('H4').border.bottom?.style, 'double');
        assert.deepEqual(sheet.getRow(11).values, [,, 'No', 'NIS', 'Nama Siswa', 'Poin Otomatis', 'Poin Esai', 'Total', 'Status']);
        assert.equal(sheet.getCell('C12').value, '0012345');
        assert.equal(sheet.getCell('C12').numFmt, '@');
        assert.equal(sheet.getCell('G12').value, 87.5);
        assert.equal(sheet.getCell('G12').numFmt, '0.00');
        assert.equal(sheet.getCell('H12').value, 'Selesai');
        assert.equal(sheet.views[0].state, 'frozen');
        assert.equal(sheet.pageSetup.orientation, 'landscape');
        assert.equal(sheet.getImages().length, 1);
        const image = workbook.getImage(Number(sheet.getImages()[0].imageId));
        assert.deepEqual(Buffer.from(image.buffer as unknown as Uint8Array), readFileSync(path.resolve(__dirname, '../src/assets', filename)));
    });
}

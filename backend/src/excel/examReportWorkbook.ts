import ExcelJS from 'exceljs';
import { schoolBlue, tableBorders, tableHeaderRow, writeSchoolLetterhead, writeSchoolTableHeader } from './schoolWorkbook';

type ReportRow = {
    nis: string;
    nama: string;
    poinOtomatis: number;
    poinEssay: number;
    total: number;
    status: string;
};

const headers = ['No', 'NIS', 'Nama Siswa', 'Poin Otomatis', 'Poin Esai', 'Total', 'Status'];
const widths = [4, 12, 23, 38, 17, 15, 13, 24];

export async function examReportWorkbook(judul: string, rows: ReportRow[], logo: 'smpip' | 'smaip') {
    const workbook = new ExcelJS.Workbook();
    const lastColumn = headers.length + 1;
    const sheet = workbook.addWorksheet('Rekap Nilai', {
        views: [{ state: 'frozen', ySplit: tableHeaderRow, showGridLines: false }],
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.getColumn('C').numFmt = '@';
    for (const column of ['E', 'F', 'G']) sheet.getColumn(column).numFmt = '0.00';
    writeSchoolLetterhead(sheet, logo, lastColumn, 'REKAP NILAI UJIAN');
    sheet.mergeCells(6, 2, 6, lastColumn);
    sheet.getRow(6).height = 32;
    const title = sheet.getCell('B6');
    title.value = judul;
    title.font = { name: 'Arial', size: 11, bold: true, color: { argb: schoolBlue } };
    title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    writeSchoolTableHeader(sheet, headers);

    rows.forEach((entry, index) => {
        const row = sheet.getRow(tableHeaderRow + index + 1);
        row.height = 22;
        const values = [index + 1, entry.nis, entry.nama, entry.poinOtomatis, entry.poinEssay, entry.total, entry.status];
        values.forEach((value, column) => {
            const cell = row.getCell(column + 2);
            cell.value = value;
            cell.font = { name: 'Arial', size: 10, bold: column === 5 };
            cell.alignment = { horizontal: column === 0 ? 'center' : typeof value === 'number' ? 'right' : 'left', vertical: 'middle' };
            cell.border = tableBorders;
        });
    });
    sheet.autoFilter = { from: { row: tableHeaderRow, column: 2 }, to: { row: tableHeaderRow + rows.length, column: lastColumn } };
    sheet.pageSetup.printTitlesRow = '1:' + tableHeaderRow;
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

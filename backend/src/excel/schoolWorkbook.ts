import fs from 'node:fs';
import path from 'node:path';
import type ExcelJS from 'exceljs';

export const schoolBlue = '1F4E78';
const line = { style: 'thin', color: { argb: 'BFBFBF' } } as const;
export const tableBorders = { top: line, left: line, bottom: line, right: line };
export const tableHeaderRow = 11;

export function writeSchoolLetterhead(sheet: ExcelJS.Worksheet, logo: 'smpip' | 'smaip', lastColumn: number, caption: string) {
    const isSmaip = logo === 'smaip';
    const titles = [
        { text: 'YAYASAN PENDIDIKAN ISLAM BAITUSSALAM', size: 10, color: '555555', height: 22 },
        { text: isSmaip ? 'SMA ISLAM PLUS BAITUSSALAM' : 'SMP ISLAM PLUS BAITUSSALAM', size: 14, color: schoolBlue, height: 28 },
        { text: caption, size: 9, color: '666666', height: 20, italic: true }
    ];
    titles.forEach((title, index) => {
        const row = index + 1;
        sheet.mergeCells(row, 2, row, lastColumn);
        sheet.getRow(row).height = title.height;
        const cell = sheet.getCell(row, 2);
        cell.value = title.text;
        cell.font = { name: 'Arial', size: title.size, bold: true, italic: title.italic, color: { argb: title.color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getRow(4).height = 16;
    for (let column = 2; column <= lastColumn; column++) {
        sheet.getCell(4, column).border = { bottom: { style: 'double', color: { argb: schoolBlue } } };
    }
    const filename = path.resolve(__dirname, '../../src/assets', isSmaip ? 'Logo_smaip.png' : 'logo_smpip.png');
    if (!fs.existsSync(filename)) {
        console.warn('[EXCEL WARNING] File logo tidak ditemukan di: ' + filename);
        return;
    }
    const image = sheet.workbook.addImage({ filename, extension: 'png' });
    sheet.addImage(image, { tl: { col: 1.15, row: 0.08 }, ext: { width: 92, height: 92 } });
}

export function writeSchoolTableHeader(sheet: ExcelJS.Worksheet, headers: readonly string[]) {
    const row = sheet.getRow(tableHeaderRow);
    row.height = 26;
    headers.forEach((header, index) => {
        const cell = row.getCell(index + 2);
        cell.value = header;
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: schoolBlue } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { ...tableBorders, bottom: { style: 'medium', color: { argb: schoolBlue } } };
    });
}

import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

export const questionTypeLabels = { PG: 'Pilihan Ganda', PM: 'Pilihan Majemuk', BS: 'Benar atau Salah', ISIAN: 'Isian Singkat', ESSAY: 'Esai', JODOH: 'Menjodohkan' };

const header = ['bagian', 'isi', 'kunci'];
const fields = {
    PG: ['opsi'], PM: ['opsi'], BS: ['pernyataan'],
    ISIAN: ['jawaban', 'angka'], ESSAY: ['poin'], JODOH: ['pasangan']
} as const;

type Kind = keyof typeof fields;
type Item = { teks: string; benar: boolean };
type Question = {
    tipeSoal: Kind; pertanyaan?: string; items: Item[]; jawaban: string[];
    angka?: boolean; poin?: number; pasangan?: { kiri: string; kanan: string }[];
};

const optionHeaders = ['Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E', 'Kunci Jawaban'];
const optionKeys = ['A', 'B', 'C', 'D', 'E'];
const multipleKeys = Array.from({ length: 31 }, (_, index) => optionKeys.filter((_, bit) => (index + 1) & (1 << bit)))
    .map(keys => keys.join(','))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
const legacyMultipleKeys = multipleKeys.filter(key => key.includes(','));
const formats: Record<Kind, { columns: string[]; example: (string | number)[]; guide: string }> = {
    PG: { columns: optionHeaders, example: ['Berapakah hasil 2 + 3?', '5', '6', '7', '8', '', 'A'], guide: 'Isi minimal dua opsi dan satu huruf kunci, contoh: A. Opsi yang tidak digunakan boleh kosong.' },
    PM: { columns: optionHeaders, example: ['Pilih semua bilangan genap.', '2', '3', '4', '5', '', 'A,C'], guide: 'Isi satu atau beberapa kunci. Pisahkan dengan koma jika lebih dari satu, contoh: A,C.' },
    BS: { columns: Array.from({ length: 5 }, (_, i) => ['Pernyataan ' + (i + 1), 'Kunci ' + (i + 1)]).flat(), example: ['Tentukan benar atau salah.', '5 lebih besar dari 3.', 'Benar', '2 adalah bilangan ganjil.', 'Salah'], guide: 'Isi setiap pasangan pernyataan dan kunci dengan Benar atau Salah. Pasangan yang tidak digunakan boleh kosong.' },
    ISIAN: { columns: ['Jawaban 1', 'Jawaban 2', 'Jawaban 3', 'Isian Angka'], example: ['Berapa hasil 3 dibagi 2?', '1,5', '1.5', '', 'Ya'], guide: 'Isi satu atau beberapa alternatif jawaban. Isi Isian Angka dengan Ya atau Tidak; kosong berarti Tidak.' },
    ESSAY: { columns: ['Poin Maksimum'], example: ['Jelaskan perbedaan bilangan ganjil dan genap.', 6], guide: 'Isi Poin Maksimum dengan bilangan bulat 1–100.' },
    JODOH: {
        columns: Array.from({ length: 5 }, (_, i) => ['Kiri ' + (i + 1), 'Kanan ' + (i + 1)]).flat(),
        example: ['Jodohkan negara dengan ibu kotanya.', 'Indonesia', 'Jakarta', 'Jepang', 'Tokyo'],
        guide: 'Isi 2–5 pasangan yang benar. Isi kedua kolom pada setiap pasangan dan gunakan jawaban kanan yang berbeda.'
    }
};

export async function questionTemplate(logo: 'smaip' | 'smpip' = 'smpip') {
    const workbook = new ExcelJS.Workbook();
    const primary = '1F4E78';
    const logoPath = path.resolve(__dirname, '../assets', logo === 'smaip' ? 'Logo_smaip.png' : 'logo_smpip.png');
    const image = fs.existsSync(logoPath) ? workbook.addImage({ filename: logoPath, extension: 'png' }) : undefined;
    for (const type of Object.keys(formats) as Kind[]) {
        const format = formats[type];
        const columns = ['No', 'Pertanyaan', ...format.columns];
        const sheet = workbook.addWorksheet(questionTypeLabels[type], {
            views: [{ state: 'normal', showGridLines: false }],
            pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
        });
        const last = columns.length + 1;
        sheet.getColumn(1).width = 4;
        columns.forEach((label, i) => {
            const col = sheet.getColumn(i + 2);
            col.width = label === 'No' ? 8 : label === 'Pertanyaan' ? 55 : label.startsWith('Kunci') || label === 'Isian Angka' || label === 'Poin Maksimum' ? 18 : 32;
            if (label !== 'No' && label !== 'Poin Maksimum') col.numFmt = '@';
        });
        const banner = (row: number, text: string, size: number, color = primary) => {
            sheet.mergeCells(row, 2, row, last);
            const cell = sheet.getCell(row, 2);
            cell.value = text;
            cell.font = { name: 'Arial', size, bold: true, color: { argb: color } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            sheet.getRow(row).height = row === 2 ? 30 : 24;
        };
        banner(1, 'YAYASAN PENDIDIKAN ISLAM BAITUSSALAM', 10, '555555');
        banner(2, (logo === 'smaip' ? 'SMA' : 'SMP') + ' ISLAM PLUS BAITUSSALAM', 14);
        banner(3, 'FORMAT IMPOR SOAL — ' + questionTypeLabels[type].toUpperCase(), 11);
        for (let col = 2; col <= last; col++) sheet.getCell(4, col).border = { bottom: { style: 'double', color: { argb: primary } } };
        if (image !== undefined) sheet.addImage(image, { tl: { col: 1.1, row: 0.1 }, ext: { width: 80, height: 80 } });
        banner(6, 'PETUNJUK PENGISIAN', 10, 'C00000');
        const guides = [
            '1. Satu soal per baris, mulai baris 12. Nomor boleh kosong. Isi hanya sheet yang digunakan.',
            '2. ' + format.guide,
            '3. Pertahankan nama sheet dan judul kolom pada baris 11. Semua sheet yang berisi soal akan diimpor.'
        ];
        guides.forEach((text, i) => {
            banner(7 + i, text, 10, '444444');
            sheet.getCell(7 + i, 2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            sheet.getCell(7 + i, 2).font = { name: 'Arial', size: 10, italic: true, color: { argb: '444444' } };
            sheet.getRow(7 + i).height = 30;
        });
        const example = ['Pertanyaan', ...format.columns].flatMap((label, i) => {
            const value = format.example[i];
            return value === undefined || value === '' ? [] : [`${label}: ${value}`];
        });
        banner(10, 'Contoh: ' + example.join('  |  '), 10, '1F4E78');
        sheet.getCell('B10').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        sheet.getRow(10).height = 36;
        sheet.addTable({ name: 'Soal_' + type, ref: 'B11', headerRow: true, style: { theme: 'TableStyleMedium2', showRowStripes: true },
            columns: columns.map(name => ({ name, filterButton: false })), rows: Array.from({ length: 20 }, () => columns.map(() => null)) });
        sheet.getRow(11).height = 32;
        for (let row = 11; row <= 12; row++) {
            sheet.getRow(row).height = 32;
            for (let col = 2; col <= last; col++) {
                const cell = sheet.getCell(row, col);
                cell.font = { name: 'Arial', size: 10, bold: row === 11, color: { argb: row === 11 ? 'FFFFFF' : '000000' } };
                cell.alignment = { vertical: 'middle', horizontal: col === 2 || row === 11 ? 'center' : 'left', wrapText: true };
                cell.border = { top: { style: 'thin', color: { argb: 'BFBFBF' } }, bottom: { style: 'thin', color: { argb: 'BFBFBF' } }, left: { style: 'thin', color: { argb: 'BFBFBF' } }, right: { style: 'thin', color: { argb: 'BFBFBF' } } };
                if (row === 11) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
            }
        }
        const dropdown = (choices: string[], prompt: string): ExcelJS.DataValidation => ({
            type: 'list', formulae: [`"${choices.join(',')}"`], allowBlank: true,
            showInputMessage: true, promptTitle: 'Pilihan yang tersedia', prompt,
            showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Pilihan tidak valid', error: 'Pilih salah satu nilai dari daftar.'
        });
        const validation = (label: string): ExcelJS.DataValidation | undefined => {
            if (label === 'Kunci Jawaban' && type === 'PG') return dropdown(optionKeys, 'Pilih satu huruf dari opsi yang terisi.');
            // Excel uses commas to separate list entries, so combinations are stored in cells.
            if (label === 'Kunci Jawaban' && type === 'PM') return {
                ...dropdown([], 'Pilih satu atau beberapa opsi yang terisi.'), formulae: [`$${sheet.getColumn(last + 1).letter}$1:$${sheet.getColumn(last + 1).letter}$${multipleKeys.length}`]
            };
            if (type === 'BS' && label.startsWith('Kunci ')) return dropdown(['Benar', 'Salah'], 'Pilih kunci untuk pernyataan di sebelah kiri.');
            if (label === 'Isian Angka') return dropdown(['Ya', 'Tidak'], 'Pilih Ya jika jawaban dinilai sebagai angka.');
            if (label === 'Poin Maksimum') return {
                type: 'whole', operator: 'between', formulae: [1, 100], allowBlank: true,
                showInputMessage: true, promptTitle: 'Poin maksimum', prompt: 'Masukkan bilangan bulat 1–100.',
                showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Poin tidak valid', error: 'Masukkan bilangan bulat 1–100.'
            };
        };
        if (type === 'PM') {
            sheet.getColumn(last + 1).hidden = true;
            multipleKeys.forEach((key, index) => { sheet.getCell(index + 1, last + 1).value = key; });
        }
        columns.forEach((label, index) => {
            const rule = validation(label);
            if (!rule) return;
            for (let row = 12; row <= 511; row++) sheet.getCell(row, index + 2).dataValidation = rule;
        });
        sheet.pageSetup.printTitlesRow = '1:11';
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

function readHorizontalWorkbook(workbook: XLSX.WorkBook) {
    const questions: { row: number; sheet: string; question: Question }[] = [];
    for (const name of workbook.SheetNames) {
        const type = (Object.keys(questionTypeLabels) as Kind[]).find(key => questionTypeLabels[key] === name);
        if (!type) throw new Error('Sheet "' + name + '" tidak dikenali. Gunakan nama sheet sesuai template soal.');
        const sheet = workbook.Sheets[name];
        const range = { s: { r: 0, c: 0 }, e: XLSX.utils.decode_range(sheet['!ref'] ?? 'A1').e };
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range, raw: false, blankrows: true, defval: '' });
        const expected = ['No', 'Pertanyaan', ...formats[type].columns];
        // The optional helper column contains only the dropdown choices for Pilihan Majemuk.
        if (type === 'PM') {
            const helperColumn = expected.length + 1;
            const helperKeys = [multipleKeys, legacyMultipleKeys].find(keys => keys.every((key, i) => rows[i]?.[helperColumn] === key));
            helperKeys?.forEach((_, i) => { rows[i][helperColumn] = ''; });
        }
        const headers = (rows[10] ?? []).slice(1).map(value => value.trim());
        // Ignore the trailing column of older essay templates.
        const acceptedColumns = expected.length + (type === 'ESSAY' ? 1 : 0);
        if (expected.some((value, i) => headers[i] !== value) || headers.slice(acceptedColumns).some(Boolean)) {
            throw new Error('Sheet ' + name + ': pertahankan judul kolom pada baris 11 sesuai template.');
        }
        for (let index = 11; index < rows.length; index++) {
            const cells = rows[index].map(value => value.trim());
            // A leftover number alone is not a question.
            const values = cells.slice(2, expected.length + 1);
            const extra = cells.slice(acceptedColumns + 1).some(Boolean);
            if (!values.some(Boolean) && !extra) continue;
            const fail = (message: string): never => { throw new Error('Sheet ' + name + ', baris ' + (index + 1) + ': ' + message); };
            if (cells[0] || extra) fail('Isi data hanya pada kolom tabel.');
            const question: Question = { tipeSoal: type, pertanyaan: values[0] ?? '', items: [], jawaban: [] };
            if (!question.pertanyaan) fail('Pertanyaan wajib diisi.');
            if (type === 'PG' || type === 'PM') {
                const options = Array.from({ length: 5 }, (_, i) => values[i + 1] ?? '');
                const keyText = values[6] ?? '';
                if (!keyText) fail('Isi minimal satu kunci jawaban.');
                const keys = keyText.toUpperCase().split(',').map(value => value.trim());
                if (keys.some(key => !/^[A-E]$/.test(key) || !options[key.charCodeAt(0) - 65]) || new Set(keys).size !== keys.length) fail('Kunci harus berupa huruf opsi yang terisi, dipisahkan koma tanpa pengulangan.');
                if (type === 'PG' && keys.length !== 1) fail('Pilih tepat satu kunci jawaban.');
                question.items = options.flatMap((teks, i) => teks ? [{ teks, benar: keys.includes(String.fromCharCode(65 + i)) }] : []);
                if (question.items.length < 2) fail('Isi minimal dua opsi jawaban.');
            } else if (type === 'BS') {
                for (let i = 1; i <= 9; i += 2) {
                    const text = values[i] ?? '';
                    const key = (values[i + 1] ?? '').toLowerCase();
                    if (!text && !key) continue;
                    if (!text || !['benar', 'salah'].includes(key)) fail('Lengkapi setiap pernyataan dengan kunci Benar atau Salah.');
                    question.items.push({ teks: text, benar: key === 'benar' });
                }
                if (!question.items.length) fail('Isi minimal satu pernyataan beserta kuncinya.');
            } else if (type === 'JODOH') {
                const pairs = [];
                for (let i = 1; i < values.length; i += 2) {
                    const kiri = values[i] ?? '', kanan = values[i + 1] ?? '';
                    if (!kiri && !kanan) continue;
                    if (!kiri || !kanan) fail('Lengkapi kolom kiri dan kanan pada setiap pasangan.');
                    pairs.push({ kiri, kanan });
                }
                if (pairs.length < 2) fail('Isi minimal dua pasangan.');
                if (new Set(pairs.map(pair => pair.kanan)).size !== pairs.length) fail('Jawaban di kolom kanan harus berbeda.');
                question.pasangan = pairs;
            } else if (type === 'ISIAN') {
                question.jawaban = values.slice(1, 4).filter(Boolean);
                if (!question.jawaban.length) fail('Isi minimal satu jawaban yang diterima.');
                const numeric = (values[4] ?? '').toLowerCase();
                if (numeric && !['ya', 'tidak'].includes(numeric)) fail('Isian Angka harus Ya atau Tidak.');
                question.angka = numeric === 'ya';
            } else {
                if (!/^\d+$/.test(values[1] ?? '') || Number(values[1]) < 1 || Number(values[1]) > 100) fail('Poin Maksimum harus bilangan bulat 1–100.');
                question.poin = Number(values[1]);
            }
            questions.push({ row: index + 1, sheet: name, question });
        }
    }
    if (!questions.length) throw new Error('Isi minimal satu soal mulai baris 12 pada salah satu sheet.');
    return questions;
}

export function readQuestionWorkbook(buffer: Buffer): { row: number; sheet?: string; question: Question }[] {
    let rows: string[][];
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (String(firstSheet?.A1?.v ?? '').trim().toLowerCase() !== 'bagian') return readHorizontalWorkbook(workbook);
        rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
            header: 1, range: 0, raw: false, blankrows: true, defval: ''
        });
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'File Excel tidak dapat dibaca.');
    }

    const first = rows[0] ?? [];
    if (!header.every((label, index) => first[index]?.trim().toLowerCase() === label) || first.slice(3).some(cell => cell.trim())) {
        throw new Error('Gunakan kolom bagian, isi, dan kunci pada baris pertama.');
    }

    const questions: { row: number; question: Question }[] = [];
    let current: Question | undefined;
    let seen = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i].map(cell => cell.trim());
        if (!row.some(Boolean)) continue;
        const [label = '', value = '', rawKey = ''] = row;
        const field = label.toLowerCase();
        const key = rawKey.toLowerCase();
        const fail = (message: string): never => { throw new Error('Baris ' + (i + 1) + ': ' + message); };
        if (field === 'pedoman' && current?.tipeSoal === 'ESSAY') continue;
        if (!field || (!value && field !== 'angka') || row.slice(3).some(Boolean)) fail('Lengkapi bagian dan isi. Gunakan tiga kolom sesuai template.');
        if (field === 'tipe') {
            const type = value.toUpperCase();
            if (!Object.prototype.hasOwnProperty.call(fields, type) || key) fail('Pilih tipe soal yang valid sesuai template dan kosongkan kunci.');
            current = { tipeSoal: type as Kind, items: [], jawaban: [] };
            questions.push({ row: i + 1, question: current });
            seen = new Set();
            continue;
        }
        if (!current) throw new Error('Baris ' + (i + 1) + ': Mulai blok soal dengan bagian tipe.');
        const allowed: readonly string[] = fields[current.tipeSoal];
        if (field !== 'soal' && !allowed.includes(field)) fail('Bagian ' + field + ' tidak berlaku untuk ' + questionTypeLabels[current.tipeSoal] + '.');
        if (field === 'opsi' || field === 'pernyataan') {
            if (key !== 'benar' && key !== 'salah') fail('Isi kunci dengan benar atau salah.');
            current.items.push({ teks: value, benar: key === 'benar' });
            continue;
        }
        if (field === 'pasangan') {
            if (!rawKey) fail('Isi kolom kunci dengan jawaban pasangan.');
            (current.pasangan ??= []).push({ kiri: value, kanan: rawKey });
            continue;
        }
        if (key) fail('Kolom kunci hanya diisi untuk opsi, pernyataan, atau pasangan.');
        if (field === 'jawaban') {
            current.jawaban.push(value);
            continue;
        }
        if (seen.has(field)) fail('Bagian ' + field + ' cukup ditulis sekali per soal.');
        seen.add(field);
        if (field === 'soal') current.pertanyaan = value;
        if (field === 'poin') {
            if (!/^\d+$/.test(value)) fail('Poin Esai harus bilangan bulat.');
            current.poin = Number(value);
        }
        if (field === 'angka') {
            if (value && !['ya', 'tidak'].includes(value.toLowerCase())) fail('Isi angka dengan ya atau tidak.');
            current.angka = value.toLowerCase() === 'ya';
        }
    }
    if (!questions.length) throw new Error('Isi minimal satu blok soal mulai baris kedua.');
    return questions;
}

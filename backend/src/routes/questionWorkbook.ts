import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const header = ['bagian', 'isi', 'kunci'];
const fields = {
    PG: ['opsi'], PM: ['opsi'], BS: ['pernyataan'],
    ISIAN: ['jawaban', 'angka'], ESSAY: ['poin', 'pedoman']
} as const;

type Kind = keyof typeof fields;
type Item = { teks: string; benar: boolean };
type Question = {
    tipeSoal: Kind; pertanyaan?: string; items: Item[]; jawaban: string[];
    angka?: boolean; poin?: number; pedoman?: string;
};

const examples = [
    ['tipe', 'PG'], ['soal', 'Berapakah hasil 2 + 3?'], ['opsi', '5', 'benar'], ['opsi', '6', 'salah'], [],
    ['tipe', 'PM'], ['soal', 'Pilih semua bilangan genap.'], ['opsi', '2', 'benar'], ['opsi', '3', 'salah'], ['opsi', '4', 'benar'], [],
    ['tipe', 'BS'], ['soal', 'Tentukan benar atau salah.'], ['pernyataan', '5 lebih besar dari 3.', 'benar'], ['pernyataan', '2 adalah bilangan ganjil.', 'salah'], [],
    ['tipe', 'ISIAN'], ['soal', 'Berapa hasil 3 dibagi 2?'], ['jawaban', '1,5'], ['jawaban', '1.5'], ['angka', 'ya'], [],
    ['tipe', 'ESSAY'], ['soal', 'Jelaskan perbedaan bilangan ganjil dan genap.'], ['poin', '6'], ['pedoman', 'Beri poin sesuai ketepatan penjelasan dan contoh.']
];

export async function questionTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Soal');
    sheet.columns = header.map((label, index) => ({ header: label, width: index === 1 ? 64 : 18 }));
    sheet.getColumn(2).numFmt = '@';
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(examples);
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function readQuestionWorkbook(buffer: Buffer) {
    let rows: string[][];
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], {
            header: 1, range: 0, raw: false, blankrows: true, defval: ''
        });
    } catch {
        throw new Error('File Excel tidak dapat dibaca.');
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
        if (!field || (!value && field !== 'pedoman' && field !== 'angka') || row.slice(3).some(Boolean)) fail('Lengkapi bagian dan isi. Gunakan tiga kolom sesuai template.');
        if (field === 'tipe') {
            const type = value.toUpperCase();
            if (!Object.prototype.hasOwnProperty.call(fields, type) || key) fail('Pilih PG, PM, BS, ISIAN, atau ESSAY dan kosongkan kunci.');
            current = { tipeSoal: type as Kind, items: [], jawaban: [] };
            questions.push({ row: i + 1, question: current });
            seen = new Set();
            continue;
        }
        if (!current) throw new Error('Baris ' + (i + 1) + ': Mulai blok soal dengan bagian tipe.');
        const allowed: readonly string[] = fields[current.tipeSoal];
        if (field !== 'soal' && !allowed.includes(field)) fail('Bagian ' + field + ' tidak berlaku untuk ' + current.tipeSoal + '.');
        if (field === 'opsi' || field === 'pernyataan') {
            if (key !== 'benar' && key !== 'salah') fail('Isi kunci dengan benar atau salah.');
            current.items.push({ teks: value, benar: key === 'benar' });
            continue;
        }
        if (key) fail('Kolom kunci hanya diisi untuk opsi atau pernyataan.');
        if (field === 'jawaban') {
            current.jawaban.push(value);
            continue;
        }
        if (seen.has(field)) fail('Bagian ' + field + ' cukup ditulis sekali per soal.');
        seen.add(field);
        if (field === 'soal') current.pertanyaan = value;
        if (field === 'pedoman') current.pedoman = value;
        if (field === 'poin') {
            if (!/^\d+$/.test(value)) fail('Poin ESSAY harus bilangan bulat.');
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

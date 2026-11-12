import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import prisma from '../config/db';
import { readNavbarSettings } from './navbarController';
import { summarizeImportIssues, type ImportIssue } from './importIssueSummary';
import { newStudentCredentials } from '../routes/studentAccounts';
import { tableBorders, tableHeaderRow, writeSchoolLetterhead, writeSchoolTableHeader } from '../excel/schoolWorkbook';

const formats = {
    siswa: ['No', 'NIS (Nomor Induk Siswa)', 'Nama Lengkap Siswa', 'Nama Kelas'],
    guru: ['No', 'NIP (Nomor Induk Pegawai)', 'Nama Lengkap Guru']
} as const;

type Role = keyof typeof formats;

export function downloadTemplate(role: Role) {
    return async (_req: Request, res: Response) => {
        try {
            const settings = await readNavbarSettings();
            const headers = formats[role];
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Format Import ' + (role === 'siswa' ? 'Siswa' : 'Guru'), {
                views: [{ showGridLines: true }]
            });
            worksheet.getColumn('A').width = 4;
            worksheet.getColumn('B').width = 12;  // Kolom B diperlebar sedikit agar logo besar muat dengan sempurna di dalamnya
            worksheet.getColumn('C').width = 28;  // NIS (Nomor Induk Siswa)
            worksheet.getColumn('D').width = 38;  // Nama Lengkap Siswa
            worksheet.getColumn('E').width = 25;  // Nama Kelas
            writeSchoolLetterhead(worksheet, settings?.logo ?? 'smpip', headers.length + 1,
                'FORMAT TEMPLATE IMPORT DATA ' + role.toUpperCase() + ' TAHUN AJARAN 2026/2027');
            worksheet.getCell('B6').value = 'PETUNJUK PENGISIAN FORMAT IMPORT:';
            worksheet.getCell('B6').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'C00000' } };
            const guidelines = role === 'siswa' ? [
                '1. Kolom NIS (Nomor Induk Siswa) wajib diisi dengan angka unik (numerik saja).',
                '2. Kolom Nama Lengkap diisi sesuai dengan dokumen resmi / dapodik sekolah.',
                '3. Kolom Nama Kelas diisi langsung dengan nama kelas yang valid (contoh: 7A, 7B, 8A).'
            ] : [
                '1. Isi NIP dengan angka unik dan simpan sebagai teks.',
                '2. Isi Nama Lengkap Guru sesuai dokumen resmi.'
            ];
            guidelines.forEach((guide, idx) => {
                const rowIdx = 7 + idx;
                const guideCell = worksheet.getCell(`B${rowIdx}`);
                guideCell.value = guide;
                guideCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: '444444' } };
            });
            worksheet.getColumn('C').numFmt = '@';
            writeSchoolTableHeader(worksheet, headers);
            const sampleData = role === 'siswa' ? [
                [1, '12345', 'Ahmad Fauzi Al-Farizi', '7A'],
                [2, '12346', 'Siti Aisyah Rahmawati', '7B']
            ] : [
                [1, '0012345', 'Ahmad Fauzi'],
                [2, '0012346', 'Siti Aisyah']
            ];
            sampleData.forEach((rowData, rowIndex) => {
                const row = worksheet.getRow(tableHeaderRow + 1 + rowIndex);
                row.height = 22;
                rowData.forEach((val, colIndex) => {
                    const cell = row.getCell(colIndex + 2); // Mulai dari Kolom B (index 2)
                    cell.value = val;
                    cell.font = { name: 'Arial', size: 10, color: { argb: '000000' } };
                    cell.border = tableBorders;
                    if (colIndex === 0 || colIndex === 3) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    }
                });
            });
            const file = await workbook.xlsx.writeBuffer();
            res.attachment('template-' + role + '.xlsx').send(Buffer.from(file));
        } catch {
            res.status(500).json({ message: 'Gagal membuat template Excel.' });
        }
    };
}

export function importUsers(role: Role) {
    return async (req: Request, res: Response) => {
        if (!req.file) return res.status(400).json({ message: 'Pilih file Excel terlebih dahulu.' });

        let rows: string[][];
        try {
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], {
                header: 1, range: 10, raw: false, blankrows: true, defval: ''
            });
        } catch {
            return res.status(400).json({ message: 'File Excel tidak dapat dibaca.' });
        }

        const expected = formats[role].slice(1);
        const header = (rows[0] ?? []).map(cell => cell.trim().toLowerCase());
        const idIndex = header.findIndex(cell => cell.startsWith(role === 'siswa' ? 'nis' : 'nip'));
        const nameIndex = header.findIndex(cell => cell.startsWith('nama lengkap'));
        const classIndex = header.findIndex(cell => cell === 'nama kelas');
        if (idIndex < 0 || nameIndex < 0 || (role === 'siswa' && classIndex < 0)) {
            return res.status(400).json({ message: 'Gunakan kolom ' + expected.join(', ') + ' pada baris 11.' });
        }

        const dataRows = rows.slice(1).map((row, index) => ({ row, number: index + 12 })).filter(({ row }) =>
            row[idIndex]?.trim() || row[nameIndex]?.trim() || (role === 'siswa' && row[classIndex]?.trim())
        );
        if (!dataRows.length) return res.status(400).json({ message: 'Isi data mulai baris 12 sebelum mengunggah.' });

        try {
            const classes = role === 'siswa' ? await prisma.kelas.findMany({ select: { id: true, namaKelas: true } }) : [];
            const classIds = new Map<string, number | null>();
            for (const item of classes) {
                const key = item.namaKelas.trim().toLowerCase();
                classIds.set(key, classIds.has(key) ? null : item.id);
            }

            const records = [];
            const seen = new Set<string>();
            const issues: ImportIssue[] = [];
            let missingClass = false;
            const idLabel = role === 'siswa' ? 'NIS' : 'NIP';
            for (const { row, number } of dataRows) {
                const username = row[idIndex]?.trim() ?? '';
                const nama = row[nameIndex]?.trim() ?? '';
                const kelas = row[classIndex]?.trim() ?? '';
                const kelasId = role === 'siswa' ? classIds.get(kelas.toLowerCase()) : undefined;
                let issue = '';
                if (!/^\d{1,50}$/.test(username)) issue = idLabel + ' harus berisi 1–50 digit tanpa tanda atau spasi.';
                else if (!nama || nama.length > 100) issue = 'Nama lengkap harus berisi 1–100 karakter.';
                else if (seen.has(username)) issue = idLabel + ' berulang dalam file.';
                else if (role === 'siswa' && !kelas) issue = 'Nama Kelas masih kosong.';
                else if (role === 'siswa' && kelasId === null) issue = 'Nama kelas "' + kelas + '" cocok dengan lebih dari satu kelas.';
                else if (role === 'siswa' && kelasId === undefined) {
                    issue = 'Kelas "' + kelas + '" belum terdaftar.';
                    missingClass = true;
                }
                if (issue) {
                    issues.push({ row: number, message: issue });
                    continue;
                }

                const credentials = role === 'siswa' ? (await newStudentCredentials()).data : { password: await bcrypt.hash(username, 10) };
                records.push({ username, nama, role, kelasId, ...credentials });
                seen.add(username);
            }
            const count = records.length ? (await prisma.user.createMany({ data: records, skipDuplicates: true })).count : 0;
            const skipped = dataRows.length - count;
            const duplicates = records.length - count;
            const details = [
                ...summarizeImportIssues(issues),
                ...(duplicates ? [duplicates + ' baris dilewati karena ' + idLabel + ' sudah terdaftar.'] : []),
                ...(missingClass ? ['Isi kolom Nama Kelas sesuai daftar kelas yang terdaftar, lalu unggah ulang.'] : [])
            ].join('\n');
            if (!count) return res.status(400).json({ message: 'Tidak ada data yang berhasil diimpor (' + skipped + ' baris).\n' + details });
            res.json({ status: 'SUCCESS', message: 'Impor selesai. Berhasil ' + count + ', dilewati ' + skipped + '.' + (details ? '\n' + details : '') });
        } catch {
            res.status(500).json({ message: 'Impor gagal. Coba lagi.' });
        }
    };
}


import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// ==================== DASHBOARD STATS ====================
export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const totalKelas = await prisma.kelas.count();
        const totalSiswa = await prisma.user.count({ where: { role: 'siswa' } });
        const totalGuru = await prisma.user.count({ where: { role: 'guru' } });
        const totalMapel = await prisma.mapel.count();

        res.json({
            status: 'SUCCESS',
            data: { totalKelas, totalSiswa, totalGuru, totalMapel }
        });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

// ==================== KELOLA KELAS (CRUD) ====================
export const manageKelas = async (req: Request, res: Response) => {
    try {
        const kelasList = await prisma.kelas.findMany({
            include: { _count: { select: { users: true } } },
            orderBy: { id: 'asc' }
        });
        res.json({ status: 'SUCCESS', data: kelasList });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const createKelas = async (req: Request, res: Response) => {
    try {
        const { namaKelas } = req.body;
        const existing = await prisma.kelas.findUnique({ where: { namaKelas } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'Kelas sudah ada!' });
        }

        const newKelas = await prisma.kelas.create({ data: { namaKelas } });
        res.status(201).json({ status: 'SUCCESS', message: 'Kelas berhasil ditambah!', data: newKelas });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const updateKelas = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { namaKelas } = req.body;

        const existingKelas = await prisma.kelas.findUnique({ where: { id: Number(id) } });
        if (!existingKelas) {
            return res.status(404).json({ status: 'ERROR', message: 'Kelas tidak ditemukan!' });
        }

        const duplicate = await prisma.kelas.findFirst({
            where: { namaKelas, NOT: { id: Number(id) } }
        });
        if (duplicate) {
            return res.status(400).json({ status: 'WARNING', message: 'Nama kelas sudah digunakan oleh kelas lain!' });
        }

        const updated = await prisma.kelas.update({
            where: { id: Number(id) },
            data: { namaKelas }
        });

        res.json({ status: 'SUCCESS', message: 'Kelas berhasil diperbarui!', data: updated });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const deleteKelas = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const kelasId = Number(id);

        const kelasTarget = await prisma.kelas.findUnique({
            where: { id: kelasId },
            include: { _count: { select: { users: true } } }
        });

        if (!kelasTarget) {
            return res.status(404).json({ status: 'ERROR', message: 'Kelas tidak ditemukan!' });
        }

        if (kelasTarget._count.users > 0) {
            return res.status(400).json({
                status: 'WARNING',
                message: `Gagal menghapus! Kelas "${kelasTarget.namaKelas}" masih memiliki ${kelasTarget._count.users} siswa. Pindahkan atau hapus siswa terlebih dahulu.`
            });
        }

        await prisma.kelas.delete({ where: { id: kelasId } });
        res.json({ status: 'SUCCESS', message: 'Kelas berhasil dihapus!' });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

// ==================== KELOLA DATA SISWA (CRUD) ====================
export const getSiswa = async (req: Request, res: Response) => {
    try {
        const siswaList = await prisma.user.findMany({
            where: { role: 'siswa' },
            include: { kelas: true },
            orderBy: { id: 'asc' }
        });
        res.json({ status: 'SUCCESS', data: siswaList });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const createSiswa = async (req: Request, res: Response) => {
    try {
        const { username, nama, kelasId } = req.body;

        // Validasi: NIS harus angka saja
        if (!/^\d+$/.test(username)) {
            return res.status(400).json({ status: 'WARNING', message: 'NIS / Username siswa harus berupa angka (numerik) saja!' });
        }

        // Validasi: Kelas wajib diisi
        if (!kelasId) {
            return res.status(400).json({ status: 'WARNING', message: 'Kelas siswa wajib dipilih!' });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'NIS / Username sudah terdaftar!' });
        }

        const hashedPassword = await bcrypt.hash(username, 10);
        const newSiswa = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role: 'siswa',
                nama,
                kelasId: Number(kelasId)
            },
            include: { kelas: true }
        });

        res.status(201).json({ status: 'SUCCESS', message: 'Siswa berhasil ditambahkan!', data: newSiswa });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const updateSiswa = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { username, nama, kelasId } = req.body;

        const existingSiswa = await prisma.user.findUnique({ where: { id: Number(id) } });
        if (!existingSiswa || existingSiswa.role !== 'siswa') {
            return res.status(404).json({ status: 'ERROR', message: 'Data siswa tidak ditemukan!' });
        }

        // Validasi: Kelas wajib diisi dan tidak boleh kosong
        if (!kelasId) {
            return res.status(400).json({ status: 'WARNING', message: 'Kelas siswa wajib dipilih dan tidak boleh dikosongkan!' });
        }

        if (username) {
            // Validasi: NIS baru harus angka saja
            if (!/^\d+$/.test(username)) {
                return res.status(400).json({ status: 'WARNING', message: 'NIS / Username siswa harus berupa angka (numerik) saja!' });
            }

            if (username !== existingSiswa.username) {
                const duplicate = await prisma.user.findUnique({ where: { username } });
                if (duplicate) {
                    return res.status(400).json({ status: 'WARNING', message: 'NIS / Username sudah digunakan akun lain!' });
                }
            }
        }

        const updatedSiswa = await prisma.user.update({
            where: { id: Number(id) },
            data: {
                username: username || existingSiswa.username,
                nama: nama || existingSiswa.nama,
                kelasId: Number(kelasId)
            },
            include: { kelas: true }
        });

        res.json({ status: 'SUCCESS', message: 'Data siswa berhasil diperbarui!', data: updatedSiswa });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const deleteSiswa = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id: Number(id), role: 'siswa' } });
        res.json({ status: 'SUCCESS', message: 'Data siswa berhasil dihapus!' });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

// ==================== DOWNLOAD TEMPLATE EXCEL SISWA (LOGO BESAR & SETARA KOP) ====================
export const downloadTemplateSiswa = async (req: Request, res: Response) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Format Import Siswa', {
            views: [{ showGridLines: true }]
        });

        const primaryColor = '1F4E78'; // Dark Navy Formal
        const borderColor = 'BFBFBF';

        // 1. Kolom A digunakan khusus sebagai Margin / Spasi Kosong di sebelah kiri
        worksheet.getColumn('A').width = 4;

        // 2. Kolom Utama (B s.d E) untuk Seluruh Kop Surat dan Tabel Utama
        worksheet.getColumn('B').width = 12;  // Kolom B diperlebar sedikit agar logo besar muat dengan sempurna di dalamnya
        worksheet.getColumn('C').width = 28;  // NIS (Nomor Induk Siswa)
        worksheet.getColumn('D').width = 38;  // Nama Lengkap Siswa
        worksheet.getColumn('E').width = 25;  // Nama Kelas

        // 3. Kop Instansi Sekolah (Merged simetris dari Kolom B s.d E)
        worksheet.mergeCells('B1:E1');
        const titleCell1 = worksheet.getCell('B1');
        titleCell1.value = 'YAYASAN PENDIDIKAN ISLAM BAITUSSALAM';
        titleCell1.font = { name: 'Arial', size: 10, bold: true, color: { argb: '555555' } };
        titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells('B2:E2');
        const titleCell2 = worksheet.getCell('B2');
        titleCell2.value = 'SMP ISLAM PLUS BAITUSSALAM';
        titleCell2.font = { name: 'Arial', size: 14, bold: true, color: { argb: primaryColor } };
        titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells('B3:E3');
        const titleCell3 = worksheet.getCell('B3');
        titleCell3.value = 'FORMAT TEMPLATE IMPORT DATA SISWA TAHUN AJARAN 2026/2027';
        titleCell3.font = { name: 'Arial', size: 9, bold: true, italic: true, color: { argb: '666666' } };
        titleCell3.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.getRow(1).height = 22;
        worksheet.getRow(2).height = 28;
        worksheet.getRow(3).height = 20;
        worksheet.getRow(4).height = 16; // Baris pembatas kop

        // 4. Garis Pembatas Ganda (Double Border) Ditarik Presisi dari B4 sampai E4
        const doubleBorder = {
            bottom: { style: 'double' as const, color: { argb: primaryColor } }
        };
        ['B', 'C', 'D', 'E'].forEach(col => {
            worksheet.getCell(`${col}4`).border = doubleBorder;
        });

        // 5. Penyematan Logo dengan Ukuran Besar (Setara Tinggi 3 Baris Kop Surat)
        const logoPath = path.resolve(process.cwd(), 'src/assets/logo_smpip.png');

        if (fs.existsSync(logoPath)) {
            const logoImageId = workbook.addImage({
                filename: logoPath,
                extension: 'png',
            });

            // Ukuran width dan height diperbesar (92x92 piksel) agar setara dan proporsional dengan tinggi teks kop
            worksheet.addImage(logoImageId, {
                tl: { col: 1.15, row: 0.08 } as any,
                ext: { width: 92, height: 92 }
            } as any);
        } else {
            console.warn(`[EXCEL WARNING] File logo tidak ditemukan di: ${logoPath}`);
        }

        // 6. Blok Panduan Pengisian Formal (Mulai dari Baris 6, Kolom B)
        worksheet.getCell('B6').value = 'PETUNJUK PENGISIAN FORMAT IMPORT:';
        worksheet.getCell('B6').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'C00000' } };

        const guidelines = [
            '1. Kolom NIS (Nomor Induk Siswa) wajib diisi dengan angka unik (numerik saja).',
            '2. Kolom Nama Lengkap diisi sesuai dengan dokumen resmi / dapodik sekolah.',
            '3. Kolom Nama Kelas diisi langsung dengan nama kelas yang valid (contoh: 7A, 7B, 8A).'
        ];

        guidelines.forEach((guide, idx) => {
            const rowIdx = 7 + idx;
            const guideCell = worksheet.getCell(`B${rowIdx}`);
            guideCell.value = guide;
            guideCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: '444444' } };
        });

        // 7. Header Tabel Utama (Baris 11, Kolom B sampai E)
        const headerRowIndex = 11;
        const headers = ['No', 'NIS (Nomor Induk Siswa)', 'Nama Lengkap Siswa', 'Nama Kelas'];
        const headerRow = worksheet.getRow(headerRowIndex);
        headerRow.height = 26;

        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 2); // Mulai dari Kolom B (index 2)
            cell.value = header;
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: primaryColor }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: borderColor } },
                left: { style: 'thin', color: { argb: borderColor } },
                bottom: { style: 'medium', color: { argb: primaryColor } },
                right: { style: 'thin', color: { argb: borderColor } }
            };
        });

        // 8. Baris Contoh Data (Baris 12 & 13)
        const sampleData = [
            [1, '12345', 'Ahmad Fauzi Al-Farizi', '7A'],
            [2, '12346', 'Siti Aisyah Rahmawati', '7B']
        ];

        sampleData.forEach((rowData, rowIndex) => {
            const row = worksheet.getRow(headerRowIndex + 1 + rowIndex);
            row.height = 22;
            rowData.forEach((val, colIndex) => {
                const cell = row.getCell(colIndex + 2); // Mulai dari Kolom B (index 2)
                cell.value = val;
                cell.font = { name: 'Arial', size: 10, color: { argb: '000000' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: borderColor } },
                    left: { style: 'thin', color: { argb: borderColor } },
                    bottom: { style: 'thin', color: { argb: borderColor } },
                    right: { style: 'thin', color: { argb: borderColor } }
                };

                if (colIndex === 0 || colIndex === 3) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            });
        });

        // 9. Output Response ke Client
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Siswa_SMP_Islam_Plus_Baitussalam.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

// ==================== Import Data Siswa Via Excel (FIXED) ====================
export const importSiswa = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'ERROR', message: 'File Excel tidak ditemukan!' });
        }

        // 1. Baca file Excel dari buffer Multer
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 2. Parse data matriks mentah (tanpa header otomatis agar akurat)
        // range: 10 artinya membaca mulai dari baris ke-11 (Header tabel kita)
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 10 });

        if (!rawRows || rawRows.length <= 1) {
            return res.status(400).json({ status: 'ERROR', message: 'File Excel kosong atau tidak berisi data siswa!' });
        }

        // Cari indeks kolom berdasarkan nama header di Baris 11
        // Struktur: [Margin(A), No(B), NIS(C), Nama(D), Kelas(E)]
        const headerRow = rawRows[0].map((h: any) => String(h || '').trim());

        const nisIdx = headerRow.findIndex(h => h.includes('NIS'));
        const namaIdx = headerRow.findIndex(h => h.includes('Nama Lengkap'));
        const kelasIdx = headerRow.findIndex(h => h.includes('Nama Kelas'));

        if (nisIdx === -1 || namaIdx === -1 || kelasIdx === -1) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Format header tabel Excel tidak valid. Pastikan header memuat NIS, Nama Lengkap, dan Nama Kelas!'
            });
        }

        let successCount = 0;
        let failCount = 0;
        const dataRows = rawRows.slice(1); // Baris data siswa setelah header

        for (const row of dataRows) {
            if (!row || row.length === 0) continue;

            const nis = String(row[nisIdx] || '').trim();
            const nama = String(row[namaIdx] || '').trim();
            const namaKelas = String(row[kelasIdx] || '').trim();

            // Lewati jika baris kosong
            if (!nis || !nama || !namaKelas) {
                continue;
            }

            // Validasi NIS harus berupa angka (numerik) saja
            if (!/^\d+$/.test(nis)) {
                failCount++;
                continue;
            }

            // Cari Kelas di DB menggunakan findFirst (Aman jika namaKelas bukan @unique)
            const kelasRecord = await prisma.kelas.findFirst({
                where: { namaKelas: { equals: namaKelas, mode: 'insensitive' } }
            });

            if (!kelasRecord) {
                console.warn(`[IMPORT FAILED] Kelas "${namaKelas}" tidak ditemukan di database.`);
                failCount++;
                continue;
            }

            // Cek apakah NIS / Username sudah terdaftar
            const existingUser = await prisma.user.findUnique({ where: { username: nis } });
            if (existingUser) {
                failCount++;
                continue;
            }

            // Hash password default = NIS
            const hashedPassword = await bcrypt.hash(nis, 10);

            // Simpan siswa baru ke database
            await prisma.user.create({
                data: {
                    username: nis,
                    password: hashedPassword,
                    role: 'siswa',
                    nama: nama,
                    kelasId: kelasRecord.id
                }
            });

            successCount++;
        }

        return res.json({
            status: 'SUCCESS',
            message: `Import selesai! Berhasil: ${successCount} siswa, Gagal/Dilewati: ${failCount} baris.`
        });

    } catch (error: any) {
        console.error('[IMPORT ERROR]:', error);
        return res.status(500).json({ status: 'ERROR', message: `Gagal mengimport file Excel: ${error.message}` });
    }
};

// ==================== KELOLA DATA GURU (CRUD + PENUGASAN) ====================
export const getGuru = async (req: Request, res: Response) => {
    try {
        const guruList = await prisma.user.findMany({
            where: { role: 'guru' },
            include: {
                pengampu: {
                    include: { mapel: true, kelas: true }
                }
            },
            orderBy: { id: 'asc' }
        });
        res.json({ status: 'SUCCESS', data: guruList });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const createGuru = async (req: Request, res: Response) => {
    try {
        const { username, nama, pengampu } = req.body;

        // Validasi: NIP harus angka saja
        if (!/^\d+$/.test(username)) {
            return res.status(400).json({ status: 'WARNING', message: 'NIP / Username guru harus berupa angka (numerik) saja!' });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'NIP / Username guru sudah terdaftar!' });
        }

        const hashedPassword = await bcrypt.hash(username, 10);
        const newGuru = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role: 'guru',
                nama,
                pengampu: pengampu && pengampu.length > 0 ? {
                    create: pengampu.map((p: { mapelId: number, kelasId: number }) => ({
                        mapelId: Number(p.mapelId),
                        kelasId: Number(p.kelasId)
                    }))
                } : undefined
            },
            include: {
                pengampu: { include: { mapel: true, kelas: true } }
            }
        });

        res.status(201).json({ status: 'SUCCESS', message: 'Guru dan penugasannya berhasil ditambahkan!', data: newGuru });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const updateGuru = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { username, nama, pengampu } = req.body;
        const guruIdNum = Number(id);

        const existingGuru = await prisma.user.findUnique({ where: { id: guruIdNum } });
        if (!existingGuru || existingGuru.role !== 'guru') {
            return res.status(404).json({ status: 'ERROR', message: 'Data guru tidak ditemukan!' });
        }

        if (username) {
            // Validasi: NIP baru harus angka saja
            if (!/^\d+$/.test(username)) {
                return res.status(400).json({ status: 'WARNING', message: 'NIP / Username guru harus berupa angka (numerik) saja!' });
            }

            if (username !== existingGuru.username) {
                const duplicate = await prisma.user.findUnique({ where: { username } });
                if (duplicate) {
                    return res.status(400).json({ status: 'WARNING', message: 'NIP / Username sudah digunakan akun guru lain!' });
                }
            }
        }

        // Hapus penugasan lama, lalu buat ulang sesuai inputan dinamis baru
        await prisma.guruMapelKelas.deleteMany({
            where: { guruId: guruIdNum }
        });

        const updatedGuru = await prisma.user.update({
            where: { id: guruIdNum },
            data: {
                username: username || existingGuru.username,
                nama: nama || existingGuru.nama,
                pengampu: pengampu && pengampu.length > 0 ? {
                    create: pengampu.map((p: { mapelId: number, kelasId: number }) => ({
                        mapelId: Number(p.mapelId),
                        kelasId: Number(p.kelasId)
                    }))
                } : undefined
            },
            include: {
                pengampu: { include: { mapel: true, kelas: true } }
            }
        });

        res.json({ status: 'SUCCESS', message: 'Data guru dan penugasannya berhasil diperbarui!', data: updatedGuru });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const deleteGuru = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id: Number(id), role: 'guru' } });
        res.json({ status: 'SUCCESS', message: 'Data guru berhasil dihapus!' });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

// ==================== KELOLA MATA PELAJARAN (CRUD) ====================
export const getMapel = async (req: Request, res: Response) => {
    try {
        const mapelList = await prisma.mapel.findMany({
            include: {
                pengampu: {
                    include: { guru: true, kelas: true }
                }
            },
            orderBy: { id: 'asc' }
        });
        res.json({ status: 'SUCCESS', data: mapelList });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const createMapel = async (req: Request, res: Response) => {
    try {
        const { nama } = req.body;

        const existing = await prisma.mapel.findFirst({ where: { nama } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'Mata pelajaran sudah ada!' });
        }

        const newMapel = await prisma.mapel.create({
            data: { nama }
        });

        res.status(201).json({ status: 'SUCCESS', message: 'Mata pelajaran berhasil ditambahkan!', data: newMapel });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const updateMapel = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { nama } = req.body;

        const existingMapel = await prisma.mapel.findUnique({ where: { id: Number(id) } });
        if (!existingMapel) {
            return res.status(404).json({ status: 'ERROR', message: 'Mata pelajaran tidak ditemukan!' });
        }

        const duplicate = await prisma.mapel.findFirst({
            where: {
                nama,
                NOT: { id: Number(id) }
            }
        });
        if (duplicate) {
            return res.status(400).json({ status: 'WARNING', message: 'Nama mata pelajaran sudah digunakan!' });
        }

        const updated = await prisma.mapel.update({
            where: { id: Number(id) },
            data: { nama }
        });

        res.json({ status: 'SUCCESS', message: 'Mata pelajaran berhasil diperbarui!', data: updated });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const deleteMapel = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.mapel.delete({
            where: { id: Number(id) }
        });

        res.json({ status: 'SUCCESS', message: 'Mata pelajaran berhasil dihapus!' });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

// ==================== KELOLA PENUGASAN (GURU - MAPEL - KELAS) ====================
export const getGuruMapelKelas = async (req: Request, res: Response) => {
    try {
        const list = await prisma.guruMapelKelas.findMany({
            include: {
                guru: true,
                mapel: true,
                kelas: true
            },
            orderBy: { id: 'asc' }
        });
        res.json({ status: 'SUCCESS', data: list });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const assignGuruMapelKelas = async (req: Request, res: Response) => {
    try {
        const { guruId, mapelId, kelasId } = req.body;

        const existing = await prisma.guruMapelKelas.findFirst({
            where: { guruId: Number(guruId), mapelId: Number(mapelId), kelasId: Number(kelasId) }
        });

        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'Penugasan mengajar untuk kelas ini sudah ada!' });
        }

        const newAssignment = await prisma.guruMapelKelas.create({
            data: {
                guruId: Number(guruId),
                mapelId: Number(mapelId),
                kelasId: Number(kelasId)
            },
            include: { guru: true, mapel: true, kelas: true }
        });

        res.status(201).json({ status: 'SUCCESS', message: 'Penugasan berhasil ditambahkan!', data: newAssignment });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const deleteGuruMapelKelas = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.guruMapelKelas.delete({
            where: { id: Number(id) }
        });
        res.json({ status: 'SUCCESS', message: 'Penugasan berhasil dihapus!' });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};
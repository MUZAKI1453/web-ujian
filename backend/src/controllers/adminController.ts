import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';

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
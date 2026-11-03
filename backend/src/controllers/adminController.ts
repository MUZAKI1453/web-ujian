import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';

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
        const { namaKelas, tingkat } = req.body;
        if (tingkat !== undefined && tingkat !== null && !isGrade(tingkat)) {
            return res.status(400).json({ message: 'Tingkat harus berupa angka 1 sampai 3.' });
        }
        const existing = await prisma.kelas.findUnique({ where: { namaKelas } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'Kelas sudah ada!' });
        }

        const newKelas = await prisma.kelas.create({ data: { namaKelas, tingkat } });
        res.status(201).json({ status: 'SUCCESS', message: 'Kelas berhasil ditambah!', data: newKelas });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const updateKelas = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { namaKelas, tingkat } = req.body;
        if (tingkat !== undefined && tingkat !== null && !isGrade(tingkat)) {
            return res.status(400).json({ message: 'Tingkat harus berupa angka 1 sampai 3.' });
        }

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

        const updated = await prisma.$transaction(async tx => {
            if (tingkat !== undefined) await lockAssignments(tx);
            if (tingkat != null) {
                const assignments = await tx.guruMapelKelas.findMany({
                    where: { OR: [{ kelasId: Number(id) }, { kelasId: null, tingkat }] },
                    include: { mapel: { select: { nama: true } } }
                });
                const gradeAssignments = assignments.filter(item => item.kelasId === null);
                const conflict = assignments.find(item => item.kelasId !== null &&
                    gradeAssignments.some(other => other.mapelId === item.mapelId && other.guruId !== item.guruId));
                if (conflict) {
                    throw new AssignmentConflict('Tingkat kelas tidak bisa diubah karena penugasan ' +
                        conflict.mapel.nama + ' akan bertabrakan dengan guru lain.');
                }
            }
            return tx.kelas.update({ where: { id: Number(id) }, data: { namaKelas, tingkat } });
        });

        res.json({ status: 'SUCCESS', message: 'Kelas berhasil diperbarui!', data: updated });
    } catch (error: any) {
        if (error instanceof AssignmentConflict) return res.status(409).json({ message: error.message });
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
            select: { id: true, username: true, nama: true, kelas: true },
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
        if (typeof username !== 'string' || !/^\d{1,50}$/.test(username)) {
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
            select: { id: true, username: true, nama: true, kelas: true }
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
            if (typeof username !== 'string' || !/^\d{1,50}$/.test(username)) {
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
            select: { id: true, username: true, nama: true, kelas: true }
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

function isGrade(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3;
}

function normalizeAssignments(input: unknown) {
    if (input === undefined) return undefined;
    if (!Array.isArray(input)) return null;
    const pairs = new Map<string, { mapelId: number; kelasId: number | null; tingkat: number | null }>();
    for (const item of input) {
        const mapelId = Number(item?.mapelId);
        const kelasId = item?.kelasId == null || item.kelasId === '' ? null : Number(item.kelasId);
        const tingkat = item?.tingkat ?? null;
        if (!Number.isSafeInteger(mapelId) || mapelId < 1 || (kelasId === null) === (tingkat === null)) return null;
        if (kelasId !== null && (!Number.isSafeInteger(kelasId) || kelasId < 1)) return null;
        if (tingkat !== null && !isGrade(tingkat)) return null;
        const key = mapelId + ':' + (kelasId === null ? 'tingkat-' + tingkat : 'kelas-' + kelasId);
        if (pairs.has(key)) return null;
        pairs.set(key, { mapelId, kelasId, tingkat });
    }
    return [...pairs.values()];
}

export const getGuru = async (req: Request, res: Response) => {
    try {
        const guruList = await prisma.user.findMany({
            where: { role: 'guru' },
            select: {
                id: true, username: true, nama: true,
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

class AssignmentConflict extends Error {}

async function lockAssignments(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(845213)`;
}

async function checkAssignmentConflicts(
    tx: Prisma.TransactionClient,
    assignments: NonNullable<ReturnType<typeof normalizeAssignments>>,
    guruId?: number
) {
    if (!assignments.length) return;
    // Serialize assignment checks and writes, including requests using different endpoints.
    await lockAssignments(tx);
    const classes = await tx.kelas.findMany({ select: { id: true, tingkat: true } });
    const grades = new Map(classes.map(kelas => [kelas.id, kelas.tingkat]));
    const existing = await tx.guruMapelKelas.findMany({
        where: { mapelId: { in: assignments.map(item => item.mapelId) }, guruId: guruId === undefined ? undefined : { not: guruId } },
        include: { mapel: true, guru: { select: { nama: true, username: true } } }
    });
    for (const item of assignments) {
        const conflict = existing.find(other => {
            if (other.mapelId !== item.mapelId) return false;
            if (item.kelasId !== null && other.kelasId !== null) return item.kelasId === other.kelasId;
            if (item.kelasId !== null) return other.tingkat === grades.get(item.kelasId);
            if (other.kelasId !== null) return item.tingkat === grades.get(other.kelasId);
            return item.tingkat === other.tingkat;
        });
        if (conflict) {
            throw new AssignmentConflict(conflict.mapel.nama + ' pada cakupan tersebut sudah diampu oleh ' +
                (conflict.guru.nama || conflict.guru.username) + '.');
        }
    }
}

export const createGuru = async (req: Request, res: Response) => {
    try {
        const { username, nama, pengampu } = req.body;
        const assignments = normalizeAssignments(pengampu);
        if (assignments === null) {
            return res.status(400).json({ message: 'Pilih satu mapel dan satu cakupan (tingkat atau kelas) untuk setiap penugasan. Hindari penugasan yang sama.' });
        }

        // Validasi: NIP harus angka saja
        if (typeof username !== 'string' || !/^\d{1,50}$/.test(username)) {
            return res.status(400).json({ status: 'WARNING', message: 'NIP / Username guru harus berupa angka (numerik) saja!' });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'NIP / Username guru sudah terdaftar!' });
        }

        const hashedPassword = await bcrypt.hash(username, 10);
        const newGuru = await prisma.$transaction(async tx => {
            await checkAssignmentConflicts(tx, assignments ?? []);
            return tx.user.create({
                data: {
                    username,
                    password: hashedPassword,
                    role: 'guru',
                    nama,
                    pengampu: assignments ? { create: assignments } : undefined
                },
                select: {
                    id: true, username: true, nama: true,
                    pengampu: { include: { mapel: true, kelas: true } }
                }
            });
        });

        res.status(201).json({ status: 'SUCCESS', message: 'Guru dan penugasannya berhasil ditambahkan!', data: newGuru });
    } catch (error: any) {
        if (error instanceof AssignmentConflict) return res.status(409).json({ message: error.message });
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

export const updateGuru = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { username, nama, pengampu } = req.body;
        const assignments = normalizeAssignments(pengampu);
        if (assignments === null) {
            return res.status(400).json({ message: 'Pilih satu mapel dan satu cakupan (tingkat atau kelas) untuk setiap penugasan. Hindari penugasan yang sama.' });
        }
        const guruIdNum = Number(id);

        const existingGuru = await prisma.user.findUnique({ where: { id: guruIdNum } });
        if (!existingGuru || existingGuru.role !== 'guru') {
            return res.status(404).json({ status: 'ERROR', message: 'Data guru tidak ditemukan!' });
        }

        if (username) {
            // Validasi: NIP baru harus angka saja
            if (typeof username !== 'string' || !/^\d{1,50}$/.test(username)) {
                return res.status(400).json({ status: 'WARNING', message: 'NIP / Username guru harus berupa angka (numerik) saja!' });
            }

            if (username !== existingGuru.username) {
                const duplicate = await prisma.user.findUnique({ where: { username } });
                if (duplicate) {
                    return res.status(400).json({ status: 'WARNING', message: 'NIP / Username sudah digunakan akun guru lain!' });
                }
            }
        }

        const updatedGuru = await prisma.$transaction(async tx => {
            await checkAssignmentConflicts(tx, assignments ?? [], guruIdNum);
            return tx.user.update({
                where: { id: guruIdNum },
                data: {
                    username: username || existingGuru.username,
                    nama: nama || existingGuru.nama,
                    pengampu: assignments ? { deleteMany: {}, create: assignments } : undefined
                },
                select: {
                    id: true, username: true, nama: true,
                    pengampu: { include: { mapel: true, kelas: true } }
                }
            });
        });

        res.json({ status: 'SUCCESS', message: 'Data guru dan penugasannya berhasil diperbarui!', data: updatedGuru });
    } catch (error: any) {
        if (error instanceof AssignmentConflict) return res.status(409).json({ message: error.message });
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
                    include: { guru: { select: { id: true, nama: true, username: true } }, kelas: true }
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
                guru: { select: { id: true, nama: true, username: true } },
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
        const { guruId, mapelId, kelasId, tingkat } = req.body;
        const assignment = normalizeAssignments([{ mapelId, kelasId, tingkat }])?.[0];
        if (!assignment) return res.status(400).json({ message: 'Pilih mapel dan satu tingkat atau kelas.' });
        const guru = await prisma.user.findUnique({ where: { id: Number(guruId), role: 'guru' }, select: { id: true } });
        if (!guru) return res.status(404).json({ message: 'Guru tidak ditemukan.' });

        const existing = await prisma.guruMapelKelas.findFirst({
            where: { guruId: guru.id, ...assignment }
        });

        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'Penugasan mengajar untuk kelas ini sudah ada!' });
        }

        const newAssignment = await prisma.$transaction(async tx => {
            await checkAssignmentConflicts(tx, [assignment], guru.id);
            return tx.guruMapelKelas.create({
                data: { guruId: guru.id, ...assignment },
                include: { guru: { select: { id: true, nama: true, username: true } }, mapel: true, kelas: true }
            });
        });

        res.status(201).json({ status: 'SUCCESS', message: 'Penugasan berhasil ditambahkan!', data: newAssignment });
    } catch (error: any) {
        if (error instanceof AssignmentConflict) return res.status(409).json({ message: error.message });
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
export function deleteAccounts(role: 'siswa' | 'guru') {
    return async (req: Request, res: Response) => {
        const ids = req.body?.ids;
        if (!Array.isArray(ids) || !ids.length ||
            !ids.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
            return res.status(400).json({ message: 'Pilih akun yang akan dihapus.' });
        }

        try {
            const { count } = await prisma.user.deleteMany({ where: { role, id: { in: ids } } });
            res.json({ status: 'SUCCESS', count });
        } catch {
            res.status(500).json({ message: 'Gagal menghapus data ' + role + '.' });
        }
    };
}
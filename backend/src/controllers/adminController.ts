import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';

function validDeleteIds(ids: unknown): ids is number[] {
    return Array.isArray(ids) && ids.length > 0 &&
        ids.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647);
}

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

        const updated = await prisma.kelas.update({ where: { id: Number(id) }, data: { namaKelas } });

        res.json({ status: 'SUCCESS', message: 'Kelas berhasil diperbarui!', data: updated });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
};

async function removeKelas(ids: unknown, res: Response, single = false) {
    if (!validDeleteIds(ids)) {
        return res.status(400).json({ message: 'Pilih kelas yang akan dihapus.' });
    }

    try {
        const result = await prisma.$transaction(async tx => {
            // Lock kelas sebelum memeriksa siswa agar relasi baru tidak masuk saat penghapusan.
            const targets = await tx.$queryRaw<{ id: number }[]>`
                SELECT id FROM kelas WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE
            `;
            const targetIds = targets.map(target => target.id);
            if (!targetIds.length) return { count: 0 };

            const occupied = await tx.kelas.findMany({
                where: { id: { in: targetIds }, users: { some: {} } },
                select: { namaKelas: true },
                orderBy: { namaKelas: 'asc' }
            });
            if (occupied.length) return { occupied, count: 0 };

            return tx.kelas.deleteMany({ where: { id: { in: targetIds } } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

        if ('occupied' in result) {
            const names = result.occupied.map(kelas => kelas.namaKelas).join(', ');
            return res.status(single ? 400 : 409).json({
                message: `Kelas berikut masih memiliki siswa: ${names}. Pindahkan atau hapus siswanya, atau keluarkan kelas tersebut dari pilihan.`
            });
        }
        if (single && result.count === 0) {
            return res.status(404).json({ status: 'ERROR', message: 'Kelas tidak ditemukan!' });
        }
        res.json({ status: 'SUCCESS', count: result.count, message: 'Kelas berhasil dihapus!' });
    } catch (error) {
        console.error('Gagal menghapus kelas:', error);
        res.status(500).json({ message: 'Gagal menghapus kelas. Coba lagi.' });
    }
}

export const deleteKelas = (req: Request, res: Response) => removeKelas([Number(req.params.id)], res, true);
export const deleteSelectedKelas = (req: Request, res: Response) => removeKelas(req.body?.ids, res);

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
            return res.status(400).json({ status: 'WARNING', message: 'NIS siswa harus berupa angka (numerik) saja!' });
        }

        // Validasi: Kelas wajib diisi
        if (!kelasId) {
            return res.status(400).json({ status: 'WARNING', message: 'Kelas siswa wajib dipilih!' });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(409).json({ status: 'WARNING', message: 'NIS sudah digunakan akun lain. Gunakan NIS yang berbeda.' });
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
        // Permintaan lain dapat memakai NIS ini setelah pemeriksaan di atas.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ status: 'WARNING', message: 'NIS sudah digunakan akun lain. Gunakan NIS yang berbeda.' });
        }
        console.error('Gagal menambahkan siswa:', error);
        res.status(500).json({ status: 'ERROR', message: 'Gagal menambahkan siswa. Coba lagi.' });
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
                return res.status(400).json({ status: 'WARNING', message: 'NIS siswa harus berupa angka (numerik) saja!' });
            }

            if (username !== existingSiswa.username) {
                const duplicate = await prisma.user.findUnique({ where: { username } });
                if (duplicate) {
                    return res.status(409).json({ status: 'WARNING', message: 'NIS sudah digunakan akun lain. Gunakan NIS yang berbeda.' });
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
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ status: 'WARNING', message: 'NIS sudah digunakan akun lain. Gunakan NIS yang berbeda.' });
        }
        console.error('Gagal memperbarui siswa:', error);
        res.status(500).json({ status: 'ERROR', message: 'Gagal memperbarui siswa. Coba lagi.' });
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

function normalizeAssignments(input: unknown) {
    if (input === undefined) return undefined;
    if (!Array.isArray(input)) return null;
    const pairs = new Map<string, { mapelId: number; kelasId: number }>();
    for (const item of input) {
        const mapelId = Number(item?.mapelId);
        const kelasId = Number(item?.kelasId);
        if (![mapelId, kelasId].every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) return null;
        const key = mapelId + ":" + kelasId;
        if (pairs.has(key)) return null;
        pairs.set(key, { mapelId, kelasId });
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
    const existing = await tx.guruMapelKelas.findMany({
        where: { mapelId: { in: assignments.map(item => item.mapelId) }, guruId: guruId === undefined ? undefined : { not: guruId } },
        include: { mapel: true, guru: { select: { nama: true, username: true } } }
    });
    for (const item of assignments) {
        const conflict = existing.find(other => other.mapelId === item.mapelId && other.kelasId === item.kelasId);
        if (conflict) {
            throw new AssignmentConflict(conflict.mapel.nama + ' di kelas tersebut sudah diampu oleh ' +
                (conflict.guru.nama || conflict.guru.username) + '.');
        }
    }
}

export const createGuru = async (req: Request, res: Response) => {
    try {
        const { username, nama, pengampu } = req.body;
        const assignments = normalizeAssignments(pengampu);
        if (assignments === null) {
            return res.status(400).json({ message: 'Pilih satu mapel dan satu kelas untuk setiap penugasan. Hindari penugasan yang sama.' });
        }

        // Validasi: NIP harus angka saja
        if (typeof username !== 'string' || !/^\d{1,50}$/.test(username)) {
            return res.status(400).json({ status: 'WARNING', message: 'NIP guru harus berupa angka (numerik) saja!' });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ status: 'WARNING', message: 'NIP guru sudah terdaftar!' });
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
            return res.status(400).json({ message: 'Pilih satu mapel dan satu kelas untuk setiap penugasan. Hindari penugasan yang sama.' });
        }
        const guruIdNum = Number(id);

        const existingGuru = await prisma.user.findUnique({ where: { id: guruIdNum } });
        if (!existingGuru || existingGuru.role !== 'guru') {
            return res.status(404).json({ status: 'ERROR', message: 'Data guru tidak ditemukan!' });
        }

        if (username) {
            // Validasi: NIP baru harus angka saja
            if (typeof username !== 'string' || !/^\d{1,50}$/.test(username)) {
                return res.status(400).json({ status: 'WARNING', message: 'NIP guru harus berupa angka (numerik) saja!' });
            }

            if (username !== existingGuru.username) {
                const duplicate = await prisma.user.findUnique({ where: { username } });
                if (duplicate) {
                    return res.status(400).json({ status: 'WARNING', message: 'NIP sudah digunakan akun guru lain!' });
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

async function removeMapel(ids: unknown, res: Response) {
    if (!validDeleteIds(ids)) {
        return res.status(400).json({ message: 'Pilih mata pelajaran yang akan dihapus.' });
    }

    try {
        const { count } = await prisma.mapel.deleteMany({ where: { id: { in: ids } } });
        res.json({ status: 'SUCCESS', count, message: 'Mata pelajaran berhasil dihapus!' });
    } catch (error) {
        console.error('Gagal menghapus mata pelajaran:', error);
        res.status(500).json({ message: 'Gagal menghapus mata pelajaran.' });
    }
}

export const deleteMapel = (req: Request, res: Response) => removeMapel([Number(req.params.id)], res);
export const deleteSelectedMapel = (req: Request, res: Response) => removeMapel(req.body?.ids, res);

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
        const { guruId, mapelId, kelasId } = req.body;
        const assignment = normalizeAssignments([{ mapelId, kelasId }])?.[0];
        if (!assignment) return res.status(400).json({ message: 'Pilih mapel dan kelas.' });
        const guru = await prisma.user.findUnique({ where: { id: Number(guruId), role: 'guru' }, select: { id: true } });
        if (!guru) return res.status(404).json({ message: 'Guru tidak ditemukan.' });

        const newAssignment = await prisma.$transaction(async tx => {
            await checkAssignmentConflicts(tx, [assignment], guru.id);
            const existing = await tx.guruMapelKelas.findFirst({ where: { guruId: guru.id, ...assignment } });
            if (existing) throw new AssignmentConflict('Penugasan mengajar untuk kelas ini sudah ada!');
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
        if (!validDeleteIds(ids)) {
            return res.status(400).json({ message: 'Pilih akun yang akan dihapus.' });
        }

        try {
            const { count } = await prisma.user.deleteMany({ where: { role, id: { in: ids } } });
            res.json({ status: 'SUCCESS', count });
        } catch (error) {
            console.error('Gagal menghapus data ' + role + ':', error);
            res.status(500).json({ message: 'Gagal menghapus data ' + role + '.' });
        }
    };
}

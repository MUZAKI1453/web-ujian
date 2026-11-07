import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { sortByName } from '../controllers/displayOrder';

// Mounted under /admin, after requireUser and requireAdmin.
const router = Router();

function failure(error: unknown, res: import('express').Response) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') return res.status(409).json({ message: 'Jenis ujian dengan nama ini sudah ada.' });
        if (error.code === 'P2003') return res.status(409).json({ message: 'Jenis ujian sudah digunakan dan tidak dapat dihapus.' });
        if (error.code === 'P2025') return res.status(404).json({ message: 'Jenis ujian tidak ditemukan.' });
    }
    console.error('API jenis ujian:', error);
    return res.status(500).json({ message: 'Perubahan jenis ujian gagal diproses. Coba lagi.' });
}

router.get('/', async (_req, res) => {
    try {
        const items = await prisma.jenisUjian.findMany({ include: { _count: { select: { ujian: true } } } });
        res.json(sortByName(items, item => item.nama));
    } catch (error) { failure(error, res); }
});

router.post('/', async (req, res) => {
    const nama = typeof req.body?.nama === 'string' ? req.body.nama.trim().replace(/\s+/g, ' ') : '';
    if (!nama || nama.length > 150) return res.status(400).json({ message: 'Nama jenis ujian wajib diisi, maksimal 150 karakter.' });
    try {
        res.status(201).json(await prisma.jenisUjian.create({ data: { nama } }));
    } catch (error) { failure(error, res); }
});

router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const nama = typeof req.body?.nama === 'string' ? req.body.nama.trim().replace(/\s+/g, ' ') : '';
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return res.status(404).json({ message: 'Jenis ujian tidak ditemukan.' });
    if (!nama || nama.length > 150) return res.status(400).json({ message: 'Nama jenis ujian wajib diisi, maksimal 150 karakter.' });
    try {
        res.json(await prisma.jenisUjian.update({ where: { id }, data: { nama } }));
    } catch (error) { failure(error, res); }
});

router.post('/hapus-terpilih', async (req, res) => {
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 ||
        !ids.every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647) || new Set(ids).size !== ids.length) {
        return res.status(400).json({ message: 'Pilih 1 hingga 500 jenis ujian yang valid.' });
    }
    try {
        // A single statement is atomic: the foreign key cancels the whole deletion if any type is in use.
        await prisma.jenisUjian.deleteMany({ where: { id: { in: ids } } });
        res.json({ message: 'Jenis ujian terpilih berhasil dihapus.' });
    } catch (error) { failure(error, res); }
});

router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return res.status(404).json({ message: 'Jenis ujian tidak ditemukan.' });
    try {
        await prisma.jenisUjian.delete({ where: { id } });
        res.json({ message: 'Jenis ujian berhasil dihapus.' });
    } catch (error) { failure(error, res); }
});

export default router;

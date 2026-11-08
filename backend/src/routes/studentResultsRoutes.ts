import { Router } from 'express';
import prisma from '../config/db';
import { requireUser } from '../middleware/auth';
import { grade, object } from './examGrading';
import { studentReceipt } from './studentReceipt';

const router = Router();
router.use(requireUser, (_req, res, next) => {
    if (!['siswa', 'admin'].includes(res.locals.user.role)) return res.status(403).json({ message: 'Akses khusus siswa.' });
    next();
});

router.get('/notifikasi', async (_req, res, next) => {
    try {
        const data = await prisma.notifikasiUjian.findMany({
            where: { siswaId: res.locals.user.id }, orderBy: { id: 'desc' }, take: 50,
            include: { ujian: { select: { judul: true, mapel: { select: { nama: true } } } } }
        });
        res.json({ data });
    } catch (error) { next(error); }
});

router.patch('/notifikasi/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);
    try {
        const updated = await prisma.notifikasiUjian.updateMany({
            where: { id, siswaId: res.locals.user.id }, data: { dibaca: true }
        });
        res.sendStatus(updated.count ? 204 : 404);
    } catch (error) { next(error); }
});

router.get('/ujian/:id/bukti', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);
    try {
        const receipt = await studentReceipt(id, res.locals.user.id);
        if (!receipt) return res.status(404).json({ message: 'Bukti pengumpulan belum tersedia.' });
        res.json(receipt);
    } catch (error) { next(error); }
});

router.get('/ujian/:id/:jenis(hasil|pembahasan)', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);
    try {
        const siswaId = res.locals.user.id;
        const result = req.params.jenis === 'hasil';
        const now = new Date();
        const exam = await prisma.ujian.findFirst({
            where: { id, draf: false, jawaban: { some: { siswaId } }, ...(!result && {
                waktuSelesai: { lte: now }, susulan: { none: { waktuSelesai: { gt: now } } }
            }) },
            include: { soal: { orderBy: { id: 'asc' } }, jawaban: { where: { siswaId }, orderBy: { waktuSubmit: 'desc' }, take: 1 } }
        });
        if (!exam || !(result ? exam.hasilRilis : exam.bahasanRilis)) return res.status(404).json({ message: 'Hasil belum tersedia.' });
        const answer = exam.jawaban[0];
        const pendingOffline = await prisma.pengerjaanUjian.count({ where: { ujianId: id, siswaId, diterimaOffline: { not: null } } });
        if (!result) return res.json({ soal: exam.soal.filter(q => !q.dibatalkan).map(q => {
            // Pembahasan may be released independently of marks. Keep marks and notes behind hasilRilis.
            const mark = grade([q], answer.detailJawaban, answer.koreksiEssay);
            const points = exam.hasilRilis && !pendingOffline && !mark.pending ? mark.rincian[q.tipeSoal] : null;
            return {
                id: q.id, tipeSoal: q.tipeSoal, pertanyaan: q.pertanyaan, isi: q.isi, semuaBenar: q.semuaBenar,
                jawabanSiswa: object(answer.detailJawaban)[q.id] ?? null,
                penilaian: points ? { poin: points.poin, maksimum: points.maksimum,
                    status: q.tipeSoal === 'ESSAY' ? 'Sudah dikoreksi' : points.benar ? 'Benar' : 'Salah' } : null,
                catatan: exam.hasilRilis && !pendingOffline ? object(object(answer.koreksiEssay).catatan)[q.id] ?? null : null
            };
        }) });
        const marks = grade(exam.soal, answer.detailJawaban, answer.koreksiEssay);
        if (marks.pending || pendingOffline) return res.status(404).json({ message: 'Hasil belum tersedia.' });
        res.json({ nilai: marks.values.totalNilai, rincian: marks.rincian });
    } catch (error) { next(error); }
});

export default router;

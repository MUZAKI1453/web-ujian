import { Request, Response, Router } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { requireUser } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import { examClassIds } from './examClasses';
import { cancelViolation, defaultSecurityConfig, parseCancelReason, parseSecurityConfig } from './examSecurity';
import { parseProctorNote, proctorPanel } from './proctoring';
import { lastContact } from './studentExamRoutes';
import { proctorAccessOpen } from './studentPassword';
import { readStudentPassword, regenerateStudentPassword } from './studentAccounts';

// Panel pengawas: guru yang ditugaskan mengawasi sebuah ujian melihat peserta kelasnya, tanpa soal, kunci, jawaban, dan nilai.
// Admin diperlakukan sebagai pengawas semua kelas agar bisa memeriksa tampilan ini.
const router = Router();
router.use(requireUser, (_req, res, next) => {
    if (!['guru', 'admin'].includes(res.locals.user.role)) return res.status(403).json({ message: 'Akses khusus pengawas.' });
    next();
});

type Actor = { id: number; username: string; role: 'guru' | 'admin' };

function handle(fn: (req: Request, res: Response, actor: Actor) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try { await fn(req, res, res.locals.user); }
        catch (error) {
            console.error('API pengawas:', error);
            res.status(500).json({ message: 'Permintaan gagal diproses. Coba lagi.' });
        }
    };
}

const validId = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

function supervisedScope(actor: Actor): Prisma.UjianWhereInput {
    return { draf: false, diarsipkanPada: null, ...(actor.role === 'admin' ? {} : { pengawas: { some: { guruId: actor.id } } }) };
}

// Kelas yang diawasi pelaku pada ujian ini; null bila ia bukan pengawasnya.
async function supervisedClasses(db: Prisma.TransactionClient | typeof prisma, actor: Actor, ujianId: number) {
    const exam = await db.ujian.findFirst({
        where: { id: ujianId, ...supervisedScope(actor) },
        select: { kelasId: true, kelasTujuan: { select: { id: true } }, pengawas: { where: { guruId: actor.id }, select: { kelasId: true } } }
    });
    if (!exam) return null;
    const ids = actor.role === 'admin' ? examClassIds(exam) : exam.pengawas.map(item => item.kelasId);
    return ids.length ? ids : null;
}

router.get('/ujian', handle(async (_req, res, actor) => {
    const since = new Date(Date.now() - 86400000);
    const exams = await prisma.ujian.findMany({
        where: { ...supervisedScope(actor), OR: [{ waktuSelesai: { gte: since } }, { susulan: { some: { waktuSelesai: { gte: since } } } }] },
        orderBy: { waktuMulai: 'asc' },
        select: {
            id: true, judul: true, waktuMulai: true, waktuSelesai: true, mapel: { select: { nama: true } },
            kelas: { select: { id: true, namaKelas: true } }, kelasTujuan: { select: { id: true, namaKelas: true } },
            pengawas: { where: { guruId: actor.id }, select: { kelasId: true } }
        }
    });
    const now = Date.now();
    res.json({ now, data: exams.map(exam => {
        const classes = [...new Map([exam.kelas, ...exam.kelasTujuan].map(item => [item.id, item])).values()];
        const mine = new Set(exam.pengawas.map(item => item.kelasId));
        return {
            id: exam.id, judul: exam.judul, mapel: exam.mapel.nama, waktuMulai: exam.waktuMulai, waktuSelesai: exam.waktuSelesai,
            kelas: classes.filter(item => actor.role === 'admin' || mine.has(item.id)).map(item => item.namaKelas).sort(),
            status: now < +exam.waktuMulai ? 'Terjadwal' : now < +exam.waktuSelesai ? 'Berlangsung' : 'Selesai'
        };
    }) });
}));

async function loadPanel(actor: Actor, id: number) {
    const classIds = await supervisedClasses(prisma, actor, id);
    if (!classIds) return null;
    const exam = await prisma.ujian.findUniqueOrThrow({
        where: { id },
        select: {
            id: true, judul: true, profil: true, durasiMenit: true, ujianAsalId: true, mapel: { select: { nama: true } },
            token: true, masukBuka: true, waktuMulai: true, waktuSelesai: true,
            pesertaRemedial: { select: { id: true, nama: true, username: true, kelasId: true } },
            _count: { select: { soal: { where: { dibatalkan: false } } } },
            susulan: { orderBy: { waktuMulai: 'asc' }, select: {
                id: true, token: true, masukBuka: true, waktuMulai: true, waktuSelesai: true, peserta: { select: { siswaId: true } }
            } },
            pengerjaan: { select: { id: true, siswaId: true, sesiSusulanId: true, mulai: true, batasWaktu: true, waktuKirim: true, jawabanTersimpan: true } },
            jawaban: { select: { siswaId: true } },
            kegiatan: { where: { jenis: { in: ['pengaturan-keamanan', 'pelanggaran-ujian', 'catatan-pengawas'] } }, orderBy: { id: 'desc' },
                select: { id: true, jenis: true, pelakuId: true, alasan: true, data: true, waktu: true, pelaku: { select: { nama: true, username: true } } } }
        }
    });
    const [classes, classStudents] = await Promise.all([
        prisma.kelas.findMany({ where: { id: { in: classIds } }, select: { id: true, namaKelas: true }, orderBy: { namaKelas: 'asc' } }),
        // Ujian remedial hanya diikuti peserta remedialnya, bukan seluruh kelas.
        exam.ujianAsalId !== null ? Promise.resolve(exam.pesertaRemedial) : prisma.user.findMany({
            where: { role: 'siswa', kelasId: { in: classIds } }, select: { id: true, nama: true, username: true, kelasId: true }, orderBy: { nama: 'asc' }
        })
    ]);
    const settings = exam.kegiatan.find(row => row.jenis === 'pengaturan-keamanan');
    return proctorPanel({
        ...exam, siswa: classStudents, jumlahSoal: exam._count.soal,
        pelanggaran: exam.kegiatan.filter(row => row.jenis === 'pelanggaran-ujian'),
        catatan: exam.kegiatan.filter(row => row.jenis === 'catatan-pengawas')
    }, classes, (parseSecurityConfig(settings?.data) ?? defaultSecurityConfig).limit, attemptId => lastContact.get(attemptId));
}

router.get('/ujian/:id', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const panel = validId(id) ? await loadPanel(actor, id) : null;
    if (!panel) return res.status(404).json({ message: 'Ujian tidak ditemukan atau Anda bukan pengawasnya.' });
    const { siswaIds, ...data } = panel;
    res.json(data);
}));

// Pengawas hanya membuka dan menutup akses masuk. Mengganti token dan mengakhiri sesi tetap wewenang guru pemilik ujian.
router.patch('/ujian/:id/sesi/:sesi', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const regular = req.params.sesi === 'reguler';
    const sesiId = Number(req.params.sesi);
    const { aksi } = req.body ?? {};
    if (!validId(id) || (!regular && !validId(sesiId))) return res.status(404).json({ message: 'Sesi tidak ditemukan.' });
    if (aksi !== 'buka' && aksi !== 'tutup') return res.status(400).json({ message: 'Aksi sesi tidak valid.' });
    const now = new Date();
    const updated = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        if (!await supervisedClasses(tx, actor, id)) return null;
        const data = { masukBuka: aksi === 'buka' };
        const result = regular
            ? await tx.ujian.updateMany({ where: { id, waktuSelesai: { gt: now } }, data })
            : await tx.sesiSusulan.updateMany({ where: { id: sesiId, ujianId: id, waktuSelesai: { gt: now } }, data });
        if (result.count) await tx.kegiatanUjian.create({ data: {
            ujianId: id, pelakuId: actor.id, jenis: 'akses-masuk', data: { sesiId: regular ? null : sesiId, aksi, oleh: 'pengawas' }
        } });
        return result.count;
    });
    if (updated === null) return res.status(404).json({ message: 'Ujian tidak ditemukan atau Anda bukan pengawasnya.' });
    if (!updated) return res.status(409).json({ message: 'Sesi tidak tersedia atau sudah selesai.' });
    res.json({ message: 'Akses masuk diperbarui.' });
}));

router.patch('/ujian/:id/pelanggaran/:logId', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const logId = Number(req.params.logId);
    const reason = parseCancelReason(req.body?.alasan);
    if (!validId(id) || !validId(logId)) return res.status(404).json({ message: 'Catatan pelanggaran tidak ditemukan.' });
    if (!reason) return res.status(400).json({ message: 'Tulis alasan pembatalan, 5 sampai 300 karakter.' });
    const panel = await loadPanel(actor, id);
    if (!panel) return res.status(404).json({ message: 'Ujian tidak ditemukan atau Anda bukan pengawasnya.' });
    const supervised = new Set(panel.siswaIds);
    const result = await prisma.$transaction(tx =>
        cancelViolation(tx, id, logId, actor.id, reason, siswaId => siswaId !== null && supervised.has(siswaId)));
    if (result === 404) return res.status(404).json({ message: 'Catatan pelanggaran tidak ditemukan.' });
    if (result === 409) return res.status(409).json({ message: 'Pelanggaran ini sudah dibatalkan.' });
    writeAudit(req, { aksi: 'batalkan-pelanggaran', status: 200, pelakuId: actor.id, pelaku: actor.username, peran: 'pengawas',
        target: `ujian ${id} · siswa ${result.pelakuId} · ${result.alasan} · alasan: ${reason}` });
    res.sendStatus(204);
}));

router.post('/ujian/:id/catatan', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const note = parseProctorNote(req.body?.teks);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (!note) return res.status(400).json({ message: 'Tulis catatan 5 sampai 500 karakter.' });
    if (!await supervisedClasses(prisma, actor, id)) return res.status(404).json({ message: 'Ujian tidak ditemukan atau Anda bukan pengawasnya.' });
    await prisma.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'catatan-pengawas', data: { teks: note } } });
    res.sendStatus(204);
}));

// Pengawas membantu siswa yang lupa password: hanya peserta kelas yang diawasinya, dan hanya di sekitar waktu ujian.
async function supervisedStudent(actor: Actor, ujianId: number, siswaId: number) {
    if (!validId(ujianId) || !validId(siswaId)) return null;
    const classIds = await supervisedClasses(prisma, actor, ujianId);
    if (!classIds) return null;
    const [exam, student] = await Promise.all([
        prisma.ujian.findUniqueOrThrow({ where: { id: ujianId }, select: {
            ujianAsalId: true, waktuMulai: true, waktuSelesai: true, susulan: { select: { waktuMulai: true, waktuSelesai: true } },
            pesertaRemedial: { where: { id: siswaId }, select: { id: true } }
        } }),
        prisma.user.findFirst({ where: { id: siswaId, role: 'siswa', kelasId: { in: classIds } }, select: { id: true, username: true, sandiSiswa: true } })
    ]);
    // Ujian remedial hanya diikuti peserta remedialnya, bukan seluruh kelas.
    if (!student || (exam.ujianAsalId !== null && !exam.pesertaRemedial.length)) return null;
    return { student, classIds, open: proctorAccessOpen([exam, ...exam.susulan], Date.now()) };
}

const outsideWindow = 'Password siswa hanya bisa dibuka pengawas sejak satu jam sebelum ujian sampai ujian berakhir.';

router.get('/ujian/:id/siswa/:siswaId/sandi', handle(async (req, res, actor) => {
    const found = await supervisedStudent(actor, Number(req.params.id), Number(req.params.siswaId));
    if (!found) return res.status(404).json({ message: 'Siswa tidak ditemukan di kelas yang Anda awasi.' });
    if (!found.open) return res.status(403).json({ message: outsideWindow });
    writeAudit(req, { aksi: 'lihat-sandi-siswa', status: 200, pelakuId: actor.id, pelaku: actor.username, peran: 'pengawas',
        target: `ujian ${req.params.id} · siswa ${found.student.username}` });
    res.json({ password: readStudentPassword(found.student.sandiSiswa), adaSandi: found.student.sandiSiswa !== null });
}));

router.post('/ujian/:id/siswa/:siswaId/sandi', handle(async (req, res, actor) => {
    const found = await supervisedStudent(actor, Number(req.params.id), Number(req.params.siswaId));
    if (!found) return res.status(404).json({ message: 'Siswa tidak ditemukan di kelas yang Anda awasi.' });
    if (!found.open) return res.status(403).json({ message: outsideWindow });
    const password = await regenerateStudentPassword(found.student.id, found.classIds);
    if (!password) return res.status(404).json({ message: 'Siswa tidak ditemukan di kelas yang Anda awasi.' });
    res.json({ password, adaSandi: true });
}));

export default router;

import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { jwtSecret, requireUser } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { grade, object } from './examGrading';
import { remedialAccess, studentClassScope } from './examClasses';
import { MAX_VIOLATIONS, parseSecurityEvents, recordSecurity } from './examSecurity';
import { studentReceipt } from './studentReceipt';

const router = Router();
router.use(requireUser);

const examData = {
    mapel: { select: { nama: true } },
    susulan: { include: { peserta: { select: { siswaId: true } } }, orderBy: { waktuMulai: 'asc' as const } },
    soal: { orderBy: { id: 'asc' as const }, where: { dibatalkan: false } },
    pengerjaan: true,
    jawaban: { select: { siswaId: true } }
} satisfies Prisma.UjianInclude;
type Exam = Prisma.UjianGetPayload<{ include: typeof examData }>;

function sessionFor(exam: Exam, siswaId: number) {
    const attempt = exam.pengerjaan.find(item => item.siswaId === siswaId);
    const session = attempt
        ? exam.susulan.find(item => item.id === attempt.sesiSusulanId)
        : exam.susulan.find(item => item.peserta.some(p => p.siswaId === siswaId));
    return { session: session ?? exam, sessionId: session?.id ?? null, attempt };
}

function publicQuestions(exam: Exam) {
    return exam.soal.map(question => {
        const content = object(question.isi);
        return {
            id: question.id, tipeSoal: question.tipeSoal.toUpperCase(), pertanyaan: question.pertanyaan,
            gambar: typeof content.gambar === 'string' ? content.gambar : undefined,
            items: Array.isArray(content.items) ? content.items.map(item => {
                const entry = object(item);
                return { teks: typeof entry.teks === 'string' ? entry.teks : '', gambar: typeof entry.gambar === 'string' ? entry.gambar : undefined };
            }) : []
        };
    });
}

function deadline(attempt: Exam['pengerjaan'][number], session: { waktuSelesai: Date }) {
    return Math.min(+attempt.batasWaktu, +session.waktuSelesai);
}

type ExamUser = { id: number; role: string; sesiLogin?: string };

function respond(fn: (req: Request, res: Response, user: ExamUser) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        const user = res.locals.user;
        if (!['siswa', 'admin'].includes(user.role)) return res.status(403).json({ message: 'Akses khusus siswa.' });
        try { await fn(req, res, user); }
        catch (error) { console.error('API pengerjaan:', error); res.status(500).json({ message: 'Gagal memproses permintaan.' }); }
    };
}

router.get('/ujian', respond(async (_req, res, user) => {
    const admin = user.role === 'admin';
    const student = admin ? null : await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { kelasId: true } });
    const now = Date.now();
    const exams = await prisma.ujian.findMany({
        where: student ? { draf: false, AND: [remedialAccess(user.id)], OR: [
            ...(student.kelasId ? [studentClassScope(student.kelasId)] : []),
            { pesertaRemedial: { some: { id: user.id } } },
            { susulan: { some: { peserta: { some: { siswaId: user.id } } } } },
            { pengerjaan: { some: { siswaId: user.id } } }, { jawaban: { some: { siswaId: user.id } } }
        ] } : { draf: false, waktuMulai: { lte: new Date(now) }, waktuSelesai: { gte: new Date(now - 30 * 60000) } },
        include: {
            ...examData, soal: { where: { tipeSoal: 'ESSAY', dibatalkan: false }, select: { id: true } },
            pengerjaan: { where: { siswaId: user.id } }, jawaban: { where: { siswaId: user.id }, orderBy: { waktuSubmit: 'desc' }, take: 1, select: { siswaId: true, koreksiEssay: true, totalNilai: true } },
        },
        orderBy: { waktuMulai: 'asc' }
    });
    res.json({ now, data: exams.map(item => {
        const exam = { ...item, soal: [] };
        const { session, sessionId, attempt } = sessionFor(exam, user.id);
        const ends = attempt ? deadline(attempt, session) : +session.waktuSelesai;
        const answer = item.jawaban[0];
        const submitted = Boolean(attempt?.waktuKirim || answer);
        const offline = item.pengerjaan.some(entry => Boolean(entry.diterimaOffline));
        const menungguKoreksi = Boolean(answer && item.soal.some(q => typeof object(answer.koreksiEssay)[q.id] !== 'number'));
        const hasil = exam.hasilRilis && Boolean(answer) && !offline && !menungguKoreksi;
        return {
            id: exam.id, judul: exam.judul, mapel: exam.mapel.nama, durasi: exam.durasiMenit,
            mulai: session.waktuMulai, selesai: session.waktuSelesai, susulan: sessionId !== null,
            status: exam.draf ? 'Draf' : submitted || ends <= now ? 'Selesai' : +session.waktuMulai > now ? 'Terjadwal' : 'Berlangsung',
            masukBuka: admin || (session.masukBuka && Boolean(session.token)), attempt: attempt?.id ?? null, submitted,
            hasil, nilai: hasil ? answer.totalNilai.toFixed(2) : null, menungguKoreksi,
            pembahasan: exam.bahasanRilis && exam.jawaban.length > 0,
            offline
        };
    }) });
}));

async function locked<T>(id: number, user: ExamUser, callback: (
    tx: Prisma.TransactionClient, exam: Exam
) => Promise<T>, shared = false) {
    const userId = user.id;
    return prisma.$transaction(async tx => {
        if (shared) {
            await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR SHARE`;
            await tx.$queryRaw`SELECT id FROM pengerjaan_ujian WHERE ujian_id = ${id} AND siswa_id = ${userId} FOR UPDATE`;
        } else {
            await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        }
        const student = await tx.user.findFirst({ where: { id: userId, role: user.role, sesiLogin: user.role === 'siswa' ? user.sesiLogin ?? null : undefined }, select: { kelasId: true } });
        if (!student) return null;
        const exam = await tx.ujian.findFirst({ where: { id, draf: false, AND: user.role === 'admin' ? undefined : [remedialAccess(userId)], OR: user.role === 'admin' ? undefined : [
            ...(student.kelasId ? [studentClassScope(student.kelasId)] : []),
            { pesertaRemedial: { some: { id: userId } } },
            { susulan: { some: { peserta: { some: { siswaId: userId } } } } },
            { pengerjaan: { some: { siswaId: userId } } }
        ] }, include: {
            ...examData, pengerjaan: { where: { siswaId: userId } }, jawaban: { where: { siswaId: userId }, select: { siswaId: true } }
        } });
        return exam ? callback(tx, exam) : null;
    });
}

function packet(exam: Exam, attempt: Exam['pengerjaan'][number], session: { waktuSelesai: Date }, securityCount = 0) {
    return {
        attemptId: attempt.id, now: Date.now(), deadline: deadline(attempt, session), versi: attempt.versiJawaban,
        jawaban: object(attempt.jawabanTersimpan), soal: publicQuestions(exam), securityCount
    };
}

router.post('/ujian/:id/:langkah(siapkan|mulai)', respond(async (req, res, user) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);
    const result = await locked(id, user, async (tx, exam) => {
        const { session, sessionId, attempt } = sessionFor(exam, user.id);
        const now = Date.now();
        if (exam.jawaban.length || attempt?.waktuKirim) return { status: 409, message: 'Jawaban sudah terkirim.' };
        if (attempt) {
            if (deadline(attempt, session) <= now) return { status: 409, message: 'Waktu ujian habis.' };
            const security = await recordSecurity(tx, id, user.id, attempt.id, []);
            return { status: 200, data: packet(exam, attempt, session, security.securityCount) };
        }
        const admin = user.role === 'admin';
        if (+session.waktuMulai > now || +session.waktuSelesai <= now || (!admin && (!session.masukBuka || !session.token))) {
            return { status: 409, message: 'Akses masuk sesi belum dibuka atau sudah ditutup.' };
        }
        const gate = admin ? null : session.token;
        const prepare = req.params.langkah === 'siapkan';
        if (!prepare) {
            if (!admin) {
                try {
                    const claim = jwt.verify(String(req.body.izin ?? ''), jwtSecret, { algorithms: ['HS256'] });
                    if (typeof claim === 'string' || claim.scope !== 'mulai-ujian' || claim.ujianId !== id ||
                        claim.siswaId !== user.id || claim.sesiLogin !== user.sesiLogin ||
                        claim.sesiId !== sessionId || claim.gate !== gate) throw new Error('Izin tidak valid');
                } catch {
                    return { status: 409, message: 'Persiapan kedaluwarsa atau token berubah. Siapkan soal lagi.' };
                }
            }
            const created = await tx.pengerjaanUjian.create({ data: {
                ujianId: id, siswaId: user.id, sesiSusulanId: sessionId,
                batasWaktu: admin ? session.waktuSelesai : new Date(Math.min(now + exam.durasiMenit * 60000, +session.waktuSelesai))
            } });
            return { status: 200, data: packet(exam, created, session) };
        }
        if (!admin) {
            const key = { siswaId: user.id, ujianId: id };
            const rate = await tx.percobaanToken.findUnique({ where: { siswaId_ujianId: key } });
            if (rate?.tungguSampai && +rate.tungguSampai > now) return { status: 429, message: 'Terlalu banyak percobaan. Tunggu satu menit.' };
            const token = typeof req.body.token === 'string' ? req.body.token.trim().toUpperCase() : '';
            if (!token) return { status: 400, message: 'Masukkan token ujian.' };
            if (token !== session.token) {
                const salah = (rate?.tungguSampai ? 0 : rate?.salah ?? 0) + 1;
                const data = { salah, tungguSampai: salah >= 5 ? new Date(now + 60000) : null };
                await tx.percobaanToken.upsert({ where: { siswaId_ujianId: key }, update: data, create: { ...key, ...data } });
                return { status: salah >= 5 ? 429 : 400, message: salah >= 5 ? 'Token salah lima kali. Tunggu satu menit.' : 'Token salah.' };
            }
            await tx.percobaanToken.deleteMany({ where: key });
        }
        const izin = jwt.sign({
            scope: 'mulai-ujian', ujianId: id, siswaId: user.id, sesiId: sessionId,
            sesiLogin: user.sesiLogin, gate
        }, jwtSecret, { expiresIn: '3m' });
        return { status: 200, data: { izin } };
    });
    if (!result) return res.status(404).json({ message: 'Ujian tidak tersedia.' });
    res.status(result.status).json(result.data ?? { message: result.message });
}));

function validatedAnswers(exam: Exam, input: unknown): Prisma.InputJsonObject | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const questions = new Map(publicQuestions(exam).map(question => [String(question.id), question]));
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [id, value] of Object.entries(input)) {
        const q = questions.get(id);
        if (!q) return null;
        const option = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < q.items.length;
        if (q.tipeSoal === 'PG' && option(value)) out[id] = value;
        else if (q.tipeSoal === 'PM' && Array.isArray(value) && value.every(option) && new Set(value).size === value.length) out[id] = value;
        else if (q.tipeSoal === 'BS' && Array.isArray(value) && value.length === q.items.length && value.every(v => v === null || typeof v === 'boolean')) out[id] = value;
        else if (['ISIAN', 'ESSAY'].includes(q.tipeSoal) && typeof value === 'string' && value.length <= 12000) out[id] = value;
        else return null;
    }
    return out;
}

router.put('/ujian/:id/jawaban', respond(async (req, res, user) => {
    const id = Number(req.params.id);
    const { attemptId, versi, jawaban, kirim, antrean } = req.body;
    const events = parseSecurityEvents(req.body.securityEvents);
    if (!events) return res.status(400).json({ message: 'Data keamanan ujian tidak valid.' });
    if (![id, attemptId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647) || !Number.isSafeInteger(versi) || versi < 0 || versi > 2147483647) {
        return res.status(400).json({ message: 'Data pengerjaan tidak valid.' });
    }
    const result = await locked(id, user, async (tx, exam) => {
        const { session, attempt } = sessionFor(exam, user.id);
        const now = Date.now();
        if (!attempt || attempt.id !== attemptId) return { status: 409, code: 'RESET', message: 'Pengerjaan sudah direset.' };
        if (attempt.diterimaOffline) return { status: 200, state: 'review', versi: attempt.versiJawaban };
        if (attempt.waktuKirim || exam.jawaban.length) return { status: 200, state: 'submitted', versi: attempt.versiJawaban, message: +session.waktuSelesai < +attempt.batasWaktu ? 'Sesi diakhiri guru. Jawaban yang tersimpan sudah dikumpulkan.' : undefined };
        const security = await recordSecurity(tx, id, user.id, attempt.id, events);
        const finish = deadline(attempt, session);
        if (security.securityCount >= MAX_VIOLATIONS) {
            const input = validatedAnswers(exam, jawaban);
            const accepted = now < finish && versi > attempt.versiJawaban && input
                ? input : object(attempt.jawabanTersimpan) as Prisma.InputJsonObject;
            const marks = grade(exam.soal, accepted, null);
            await tx.pengerjaanUjian.update({ where: { id: attemptId }, data: {
                waktuKirim: new Date(now), jawabanTersimpan: accepted, versiJawaban: Math.max(versi, attempt.versiJawaban)
            } });
            await tx.jawabanSiswa.create({ data: { ujianId: id, siswaId: user.id, detailJawaban: accepted, ...marks.values } });
            await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
            if (exam.hasilRilis && !marks.pending) await tx.notifikasiUjian.create({ data: { ujianId: id, siswaId: user.id, jenis: 'hasil-dirilis' } });
            return { status: 200, state: 'submitted', versi: Math.max(versi, attempt.versiJawaban), ...security,
                message: 'Ujian dikumpulkan otomatis setelah tiga pelanggaran. Jawaban yang diterima server sudah disimpan.' };
        }
        if (versi < attempt.versiJawaban) return { status: 409, code: 'VERSI', message: 'Jawaban yang lebih baru sudah tersimpan. Buka ulang ujian.' };
        const data = validatedAnswers(exam, jawaban);
        if (!data) return { status: 400, message: 'Ada jawaban dalam format yang salah.' };
        if (now >= finish) {
            if (antrean !== true || now > finish + 300000 || versi <= attempt.versiJawaban) {
                return { status: 409, code: 'HABIS', message: 'Waktu habis. Server memakai jawaban terakhir yang tersimpan.' };
            }
            await tx.pengerjaanUjian.update({ where: { id: attemptId }, data: { kirimanOffline: data, diterimaOffline: new Date(now), versiJawaban: versi } });
            return { status: 200, state: 'review', versi, ...security };
        }
        if (versi === attempt.versiJawaban) {
            if (JSON.stringify(data) !== JSON.stringify(object(attempt.jawabanTersimpan))) {
                return { status: 409, code: 'VERSI', message: 'Jawaban berbeda pada versi yang sama. Buka ulang ujian.' };
            }
            if (kirim !== true) return { status: 200, state: 'saved', versi, ...security };
        }
        const accepted = versi === attempt.versiJawaban ? object(attempt.jawabanTersimpan) as Prisma.InputJsonObject : data;
        await tx.pengerjaanUjian.update({ where: { id: attemptId }, data: {
            jawabanTersimpan: accepted, versiJawaban: versi, ...(kirim === true ? { waktuKirim: new Date(now) } : {})
        } });
        if (kirim === true) {
            const marks = grade(exam.soal, accepted, null);
            await tx.jawabanSiswa.create({ data: { ujianId: id, siswaId: user.id, detailJawaban: accepted, ...marks.values } });
            await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
            if (exam.hasilRilis && !marks.pending) await tx.notifikasiUjian.create({
                data: { ujianId: id, siswaId: user.id, jenis: 'hasil-dirilis' }
            });
        }
        return { status: 200, state: kirim === true ? 'submitted' : 'saved', versi, ...security };
    }, kirim !== true && events.length === 0);
    if (!result) return res.status(404).json({ message: 'Ujian tidak tersedia.' });
    const receipt = result.status === 200 && ['submitted', 'review'].includes(result.state ?? '')
        ? await studentReceipt(id, user.id) : undefined;
    res.status(result.status).json({ ...result, serverTime: Date.now(), receipt });
}));

export default router;

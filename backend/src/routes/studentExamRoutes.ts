import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { jwtSecret, requireUser } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { grade, object } from './examGrading';
import { remedialAccess, studentClassScope } from './examClasses';
import { defaultSecurityConfig, parseSecurityConfig, parseSecurityEvents, recordSecurity } from './examSecurity';
import { studentReceipt } from './studentReceipt';
import { answerSummary } from './answerSummary';
import { examTokenMode } from './examProfiles';
import { answersToDisplay, answersToOriginal, type ExamOrder, makeExamOrder, orderItems, orderQuestions, parseExamOrder } from './examOrder';

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

// Soal dan opsi dikirim sesuai urutan acak milik pengerjaan ini; kunci jawaban tidak pernah ikut.
function publicQuestions(exam: Exam, order: ExamOrder | null) {
    return orderQuestions(exam.soal, order).map(question => {
        const content = object(question.isi);
        return {
            id: question.id, tipeSoal: question.tipeSoal.toUpperCase(), pertanyaan: question.pertanyaan,
            gambar: typeof content.gambar === 'string' ? content.gambar : undefined,
            items: orderItems(question.id, Array.isArray(content.items) ? content.items : [], order).map(item => {
                const entry = object(item);
                return { teks: typeof entry.teks === 'string' ? entry.teks : '', gambar: typeof entry.gambar === 'string' ? entry.gambar : undefined };
            })
        };
    });
}

function deadline(attempt: Exam['pengerjaan'][number], session: { waktuSelesai: Date }) {
    return Math.min(+attempt.batasWaktu, +session.waktuSelesai);
}

type ExamUser = { id: number; role: 'siswa' | 'admin'; sesiLogin?: string };

// Bentuk soal yang cukup untuk memvalidasi jawaban tanpa memuat isi soal dan gambarnya.
type QuestionShape = { id: string; tipeSoal: string; items: number };

function shapeOf(questions: Exam['soal']): QuestionShape[] {
    return questions.map(question => {
        const items = object(question.isi).items;
        return { id: String(question.id), tipeSoal: question.tipeSoal.toUpperCase(), items: Array.isArray(items) ? items.length : 0 };
    });
}

// Soal ujian terbit hanya berubah lewat perbaikan setelah ujian selesai, jadi bentuknya aman disimpan sebentar.
// Ini menjaga autosave tetap ringan saat ratusan siswa menyimpan bersamaan.
const SHAPE_TTL = 60_000;
const shapeCache = new Map<number, { expires: number; rows: QuestionShape[] }>();

async function questionShape(tx: Prisma.TransactionClient, ujianId: number): Promise<QuestionShape[]> {
    const now = Date.now();
    const cached = shapeCache.get(ujianId);
    if (cached && cached.expires > now) return cached.rows;
    const rows = await tx.$queryRaw<{ id: number; tipeSoal: string; items: bigint | number | null }[]>`
        SELECT id, tipeSoal, JSON_LENGTH(isi, '$.items') AS items
        FROM soal WHERE ujian_id = ${ujianId} AND dibatalkan = 0`;
    const shape = rows.map(row => ({ id: String(row.id), tipeSoal: row.tipeSoal.toUpperCase(), items: Number(row.items ?? 0) }));
    if (shapeCache.size > 500) shapeCache.clear();
    shapeCache.set(ujianId, { expires: now + SHAPE_TTL, rows: shape });
    return shape;
}

// revisiNilai menandai bahwa kumpulan jawaban ujian berubah (dipakai pratinjau perbaikan soal oleh guru).
// Penambahannya dilakukan setelah transaksi pengumpulan selesai dan digabung per detik, karena mengubah baris ujian
// di dalam transaksi membuat semua pengumpulan saling menunggu (atau deadlock saat menaikkan kunci baca).
const pendingRevisions = new Map<number, number>();
let revisionTimer: NodeJS.Timeout | null = null;

export async function flushRevisions() {
    revisionTimer = null;
    const entries = [...pendingRevisions];
    pendingRevisions.clear();
    for (const [id, count] of entries) {
        await prisma.ujian.updateMany({ where: { id }, data: { revisiNilai: { increment: count } } })
            .catch(error => console.error('Revisi nilai ujian ' + id + ':', error));
    }
}

function bumpRevision(id: number) {
    pendingRevisions.set(id, (pendingRevisions.get(id) ?? 0) + 1);
    revisionTimer ??= setTimeout(() => void flushRevisions(), 1000);
}

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
    const participation = [
        { pesertaRemedial: { some: { id: user.id } } },
        { susulan: { some: { peserta: { some: { siswaId: user.id } } } } },
        { pengerjaan: { some: { siswaId: user.id } } }, { jawaban: { some: { siswaId: user.id } } }
    ];
    const exams = await prisma.ujian.findMany({
        where: student ? { draf: false, AND: [remedialAccess(user.id)], OR: [
            ...(student.kelasId ? [studentClassScope(student.kelasId)] : []),
            ...participation
        ] } : { draf: false, OR: [
            ...participation,
            { waktuMulai: { lte: new Date(now) }, waktuSelesai: { gte: new Date(now - 30 * 60000) } }
        ] },
        include: {
            ...examData, soal: { where: { tipeSoal: 'ESSAY', dibatalkan: false }, select: { id: true } },
            susulan: { include: { peserta: { where: { siswaId: user.id }, select: { siswaId: true } } }, orderBy: { waktuMulai: 'asc' } },
            pengerjaan: { where: { siswaId: user.id } }, jawaban: { where: { siswaId: user.id }, orderBy: { waktuSubmit: 'desc' }, take: 1, select: { siswaId: true, koreksiEssay: true, totalNilai: true } },
            remedial: { select: { draf: true, waktuSelesai: true, susulan: { select: { waktuSelesai: true } } } }
        },
        orderBy: { waktuMulai: 'asc' }
    });
    res.json({ now, data: exams.map(item => {
        const exam = { ...item, soal: [] };
        const { session, sessionId, attempt } = sessionFor(exam, user.id);
        const tokenMode = examTokenMode(exam.profil);
        const ends = attempt ? deadline(attempt, session) : +session.waktuSelesai;
        const answer = item.jawaban[0];
        const submitted = Boolean(attempt?.waktuKirim || answer);
        const offline = item.pengerjaan.some(entry => Boolean(entry.diterimaOffline));
        const menungguKoreksi = Boolean(answer && item.soal.some(q => typeof object(answer.koreksiEssay)[q.id] !== 'number'));
        const hasil = exam.hasilRilis && Boolean(answer) && !offline && !menungguKoreksi;
        return {
            id: exam.id, judul: exam.judul, mapel: exam.mapel.nama, mapelId: exam.mapelId, durasi: exam.durasiMenit,
            mulai: session.waktuMulai, selesai: session.waktuSelesai, susulan: sessionId !== null,
            status: exam.draf ? 'Draf' : submitted || ends <= now ? 'Selesai' : +session.waktuMulai > now ? 'Terjadwal' : 'Berlangsung',
            masukBuka: admin || (session.masukBuka && (tokenMode !== 'wajib' || Boolean(session.token))),
            perluToken: !admin && tokenMode !== 'tanpa' && (tokenMode === 'wajib' || Boolean(session.token)), attempt: attempt?.id ?? null, submitted,
            hasil, nilai: hasil ? answer.totalNilai.toFixed(2) : null, menungguKoreksi,
            pembahasan: exam.bahasanRilis && exam.jawaban.length > 0 &&
                +exam.waktuSelesai <= now && exam.susulan.every(entry => +entry.waktuSelesai <= now) &&
                (!item.remedial || (!item.remedial.draf && +item.remedial.waktuSelesai <= now && item.remedial.susulan.every(entry => +entry.waktuSelesai <= now))),
            offline
        };
    }) });
}));

// light: autosave biasa. Tidak mengunci baris ujian dan tidak memuat isi soal.
// Transaksi siswa hanya memegang kunci baca pada baris ujian dan tidak pernah mengubah baris itu, sehingga
// ratusan pengumpulan pada detik yang sama berjalan paralel alih-alih antre satu per satu.
async function locked<T>(id: number, user: ExamUser, callback: (
    tx: Prisma.TransactionClient, exam: Exam
) => Promise<T>, light = false): Promise<T | null> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await lockedOnce(id, user, callback, light);
        } catch (error) {
            // P2034: konflik tulis atau deadlock. Aman diulang karena seluruh transaksi dibatalkan.
            if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
            await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 80 * attempt));
        }
    }
}

async function lockedOnce<T>(id: number, user: ExamUser, callback: (
    tx: Prisma.TransactionClient, exam: Exam
) => Promise<T>, light: boolean) {
    const userId = user.id;
    return prisma.$transaction(async tx => {
        if (!light) {
            await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} LOCK IN SHARE MODE`;
        }
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM pengerjaan_ujian WHERE ujian_id = ${id} AND siswa_id = ${userId} FOR UPDATE`;
        const student = await tx.user.findFirst({ where: { id: userId, role: user.role, sesiLogin: user.role === 'siswa' ? user.sesiLogin ?? null : undefined }, select: { kelasId: true } });
        if (!student) return null;
        const exam = await tx.ujian.findFirst({ where: { id, draf: false, AND: user.role === 'admin' ? undefined : [remedialAccess(userId)], OR: user.role === 'admin' ? undefined : [
            ...(student.kelasId ? [studentClassScope(student.kelasId)] : []),
            { pesertaRemedial: { some: { id: userId } } },
            { susulan: { some: { peserta: { some: { siswaId: userId } } } } },
            { pengerjaan: { some: { siswaId: userId } } }
        ] }, include: {
            ...examData, soal: { ...examData.soal, ...(light ? { take: 0 } : {}) },
            susulan: { include: { peserta: { where: { siswaId: userId }, select: { siswaId: true } } }, orderBy: { waktuMulai: 'asc' } },
            pengerjaan: { where: { siswaId: userId } }, jawaban: { where: { siswaId: userId }, select: { siswaId: true } },
            kegiatan: { where: { jenis: 'pengaturan-keamanan' }, orderBy: { id: 'desc' }, take: 1, select: { data: true } }
        } });
        return exam ? callback(tx, exam) : null;
    // READ COMMITTED: tanpa kunci celah (gap lock). Pada isolasi bawaan, siswa yang mulai bersamaan saling mengunci
    // celah indeks pengerjaan_ujian lalu deadlock saat menyisipkan pengerjaan baru. Urutan tetap dijaga kunci baris di atas.
    }, { maxWait: 8000, timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function securityConfig(exam: Exam & { kegiatan?: { data: unknown }[] }) {
    return parseSecurityConfig(exam.kegiatan?.[0]?.data) ?? defaultSecurityConfig;
}

function packet(exam: Exam, attempt: Exam['pengerjaan'][number], session: { waktuSelesai: Date }, securityCount = 0) {
    const order = parseExamOrder(attempt.urutan);
    const security = securityConfig(exam);
    return {
        attemptId: attempt.id, now: Date.now(), deadline: deadline(attempt, session), versi: attempt.versiJawaban,
        jawaban: answersToDisplay(object(attempt.jawabanTersimpan), order), soal: publicQuestions(exam, order),
        securityCount, securityWeights: security.weights, securityLimit: security.limit
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
        const tokenMode = examTokenMode(exam.profil);
        if (+session.waktuMulai > now || +session.waktuSelesai <= now || (!admin && (!session.masukBuka || (tokenMode === 'wajib' && !session.token)))) {
            return { status: 409, message: 'Akses masuk sesi belum dibuka atau sudah ditutup.' };
        }
        const gate = admin || tokenMode === 'tanpa' ? null : session.token;
        const gateProof = gate === null ? null : createHmac('sha256', jwtSecret).update(`izin-ujian:${id}:${sessionId}:${gate}`).digest('hex');
        const prepare = req.params.langkah === 'siapkan';
        if (!prepare) {
            if (!admin) {
                try {
                    const claim = jwt.verify(String(req.body.izin ?? ''), jwtSecret, { algorithms: ['HS256'] });
                    if (typeof claim === 'string' || claim.scope !== 'mulai-ujian' || claim.ujianId !== id ||
                        claim.siswaId !== user.id || claim.sesiLogin !== user.sesiLogin ||
                        claim.sesiId !== sessionId || claim.gateProof !== gateProof) throw new Error('Izin tidak valid');
                } catch {
                    return { status: 409, message: 'Persiapan kedaluwarsa atau token berubah. Siapkan soal lagi.' };
                }
            }
            const created = await tx.pengerjaanUjian.create({ data: {
                ujianId: id, siswaId: user.id, sesiSusulanId: sessionId,
                urutan: makeExamOrder(exam.soal, exam.acakSoal, exam.acakOpsi) ?? Prisma.DbNull,
                batasWaktu: admin ? session.waktuSelesai : new Date(Math.min(now + exam.durasiMenit * 60000, +session.waktuSelesai))
            } });
            return { status: 200, data: packet(exam, created, session) };
        }
        if (gate) {
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
            sesiLogin: user.sesiLogin, gateProof
        }, jwtSecret, { expiresIn: '3m' });
        return { status: 200, data: { izin } };
    });
    if (!result) return res.status(404).json({ message: 'Ujian tidak tersedia.' });
    res.status(result.status).json(result.data ?? { message: result.message });
}));

function validatedAnswers(shape: QuestionShape[], input: unknown): Prisma.InputJsonObject | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const questions = new Map(shape.map(question => [question.id, question]));
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [id, value] of Object.entries(input)) {
        const q = questions.get(id);
        if (!q) return null;
        const option = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < q.items;
        if (q.tipeSoal === 'PG' && option(value)) out[id] = value;
        else if (q.tipeSoal === 'PM' && Array.isArray(value) && value.every(option) && new Set(value).size === value.length) out[id] = value;
        else if (q.tipeSoal === 'BS' && Array.isArray(value) && value.length === q.items && value.every(v => v === null || typeof v === 'boolean')) out[id] = value;
        else if (['ISIAN', 'ESSAY'].includes(q.tipeSoal) && typeof value === 'string' && value.length <= 12000) out[id] = value;
        else return null;
    }
    return out;
}

router.put('/ujian/:id/jawaban', respond(async (req, res, user) => {
    const id = Number(req.params.id);
    const { attemptId, versi, kirim, antrean } = req.body;
    const events = parseSecurityEvents(req.body.securityEvents);
    if (!events) return res.status(400).json({ message: 'Data keamanan ujian tidak valid.' });
    if (![id, attemptId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647) || !Number.isSafeInteger(versi) || versi < 0 || versi > 2147483647) {
        return res.status(400).json({ message: 'Data pengerjaan tidak valid.' });
    }
    const light = kirim !== true && events.length === 0;
    let submitted = false;
    // Bukti kumpul disusun dari data yang sudah dimuat transaksi. Query terpisah setelahnya ikut antre di belakang
    // semua pengumpulan lain yang menunggu koneksi database, sehingga respons tertahan sampai antrean habis.
    let receiptNow: Awaited<ReturnType<typeof studentReceipt>> | undefined;
    const receiptFor = (exam: Exam, attemptId: number, questions: Parameters<typeof answerSummary>[0], answers: unknown, now: number) => ({
        id: `UJ-${id}-${user.id}-${attemptId}`, title: exam.judul, mapel: exam.mapel.nama,
        receivedAt: new Date(now), state: 'submitted', ...answerSummary(questions, answers)
    });
    const result = await locked(id, user, async (tx, exam) => {
        submitted = false;
        receiptNow = undefined;
        const { session, attempt } = sessionFor(exam, user.id);
        const now = Date.now();
        const shape = light ? await questionShape(tx, id) : shapeOf(exam.soal);
        if (!attempt || attempt.id !== attemptId) return { status: 409, code: 'RESET', message: 'Pengerjaan sudah direset.' };
        // Perangkat siswa mengirim posisi opsi sesuai urutan acaknya; server menyimpan dan menilai dengan indeks asli.
        const jawaban = answersToOriginal(req.body.jawaban, parseExamOrder(attempt.urutan));
        if (attempt.diterimaOffline) return { status: 200, state: 'review', versi: attempt.versiJawaban };
        if (attempt.waktuKirim || exam.jawaban.length) return { status: 200, state: 'submitted', versi: attempt.versiJawaban, message: +session.waktuSelesai < +attempt.batasWaktu ? 'Sesi diakhiri guru. Jawaban yang tersimpan sudah dikumpulkan.' : undefined };
        const config = securityConfig(exam);
        const security = await recordSecurity(tx, id, user.id, attempt.id, events, config.weights, config.limit);
        const finish = deadline(attempt, session);
        if (config.limit > 0 && security.securityCount >= config.limit) {
            const input = validatedAnswers(shape, jawaban);
            const accepted = now < finish && versi > attempt.versiJawaban && input
                ? input : object(attempt.jawabanTersimpan) as Prisma.InputJsonObject;
            const questions = light ? await tx.soal.findMany({ where: { ujianId: id, dibatalkan: false }, orderBy: { id: 'asc' } }) : exam.soal;
            const marks = grade(questions, accepted, null);
            receiptNow = receiptFor(exam, attemptId, questions, accepted, now);
            await tx.pengerjaanUjian.update({ where: { id: attemptId }, data: {
                waktuKirim: new Date(now), jawabanTersimpan: accepted, versiJawaban: Math.max(versi, attempt.versiJawaban)
            } });
            await tx.jawabanSiswa.create({ data: { ujianId: id, siswaId: user.id, detailJawaban: accepted, ...marks.values } });
            submitted = true;
            if (exam.hasilRilis && !marks.pending) await tx.notifikasiUjian.create({ data: { ujianId: id, siswaId: user.id, jenis: 'hasil-dirilis' } });
            return { status: 200, state: 'submitted', versi: Math.max(versi, attempt.versiJawaban), ...security,
                message: `Ujian dikumpulkan otomatis setelah ${config.limit} pelanggaran. Jawaban yang diterima server sudah disimpan.` };
        }
        if (versi < attempt.versiJawaban) return { status: 409, code: 'VERSI', message: 'Jawaban yang lebih baru sudah tersimpan. Buka ulang ujian.' };
        const data = validatedAnswers(shape, jawaban);
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
            receiptNow = receiptFor(exam, attemptId, exam.soal, accepted, now);
            await tx.jawabanSiswa.create({ data: { ujianId: id, siswaId: user.id, detailJawaban: accepted, ...marks.values } });
            submitted = true;
            if (exam.hasilRilis && !marks.pending) await tx.notifikasiUjian.create({
                data: { ujianId: id, siswaId: user.id, jenis: 'hasil-dirilis' }
            });
        }
        return { status: 200, state: kirim === true ? 'submitted' : 'saved', versi, ...security };
    }, light);
    if (submitted) bumpRevision(id);
    if (!result) return res.status(404).json({ message: 'Ujian tidak tersedia.' });
    const receipt = result.status === 200 && ['submitted', 'review'].includes(result.state ?? '')
        ? receiptNow ?? await studentReceipt(id, user.id) : undefined;
    res.status(result.status).json({ ...result, serverTime: Date.now(), receipt });
}));

export default router;

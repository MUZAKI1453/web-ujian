import { Request, Response, Router } from 'express';
import { randomInt } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isBlankAnswer } from './answerSummary';
import { examTokenMode, parseDraftExamRules } from './examProfiles';
import { cancelViolation, DEFAULT_VIOLATION_LIMIT, defaultSecurityConfig, defaultSecurityWeights, parseCancelReason, parseSecurityConfig, parseSecurityLimit, parseSecurityWeights, violationCancellation, type SecurityEvent } from './examSecurity';
import { writeAudit } from '../middleware/audit';
import { parseProctorAssignments } from './proctoring';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { requireUser } from '../middleware/auth';
import { uploadExcel } from '../middleware/upload';
import { questionTemplate, questionTypeLabels, readQuestionWorkbook } from './questionWorkbook';
import { readNavbarSettings } from '../controllers/navbarController';
import { examReportWorkbook } from '../excel/examReportWorkbook';
import { calculatePoints } from './examPoints';
import { essayLimit, grade, object, questionContent, revise } from './examGrading';
import { examClassIds, parseClassIds } from './examClasses';
import { sortByName } from '../controllers/displayOrder';
import { isDataImage, isMediaPath, storeQuestionImages } from './questionImages';
import { sortQuestions } from './questionOrder';
import { collectQuestionStats, createQuestionStats, summarizeQuestionStats } from './questionAnalytics';

const router = Router();
router.use(requireUser, (_req, res, next) => {
    if (!['guru', 'admin'].includes(res.locals.user.role)) return res.status(403).json({ message: 'Akses khusus guru dan admin.' });
    next();
});

function validId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}

type Account = { id: number; role: 'guru' | 'admin' };
type Actor = { id: number; role: 'admin' } |
    { id: number; role: 'guru'; pairs: Awaited<ReturnType<typeof assignments>> };

function examScope(actor: Actor): Prisma.UjianWhereInput {
    if (actor.role === 'admin') return {};
    return {
        OR: [
            { guruId: actor.id },
            {
                guru: { role: 'admin' },
                OR: [...new Set(actor.pairs.map(pair => pair.mapel.id))].map(mapelId => {
                    const ids = actor.pairs.filter(pair => pair.mapel.id === mapelId).map(pair => pair.kelas.id);
                    return { mapelId, kelasId: { in: ids }, kelasTujuan: { every: { id: { in: ids } } } };
                })
            }
        ]
    };
}

function handle(fn: (req: Request, res: Response, actor: Actor) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            const user: Account = res.locals.user;
            const actor: Actor = user.role === 'guru'
                ? { id: user.id, role: 'guru', pairs: await assignments(user) }
                : { id: user.id, role: 'admin' };
            await fn(req, res, actor);
        } catch (error) {
            console.error('API ujian guru:', error);
            res.status(500).json({ message: 'Perubahan gagal diproses. Coba lagi.' });
        }
    };
}

async function assignments(actor: Account) {
    if (actor.role === 'admin') {
        const [subjects, classes] = await Promise.all([
            prisma.mapel.findMany({ select: { id: true, nama: true }, orderBy: { nama: 'asc' } }),
            prisma.kelas.findMany({ select: { id: true, namaKelas: true }, orderBy: { namaKelas: 'asc' } })
        ]);
        return subjects.flatMap(mapel => classes.map(kelas => ({ mapel, kelas })));
    }

    const records = await prisma.guruMapelKelas.findMany({
        where: { guruId: actor.id },
        include: { mapel: true, kelas: true }
    });
    const pairs = new Map(records.map(({ mapelId, kelasId, mapel, kelas }) => [mapelId + ':' + kelasId, { mapel, kelas }]));
    return [...pairs.values()];
}

const examFields = {
    id: true, judul: true, jenisUjianId: true, profil: true, waktuMulai: true, waktuSelesai: true, durasiMenit: true, draf: true,
    hasilRilis: true, bahasanRilis: true, diarsipkanPada: true, poinKhusus: true, ujianAsalId: true, acakSoal: true, acakOpsi: true,
    mapel: { select: { id: true, nama: true } }, kelas: { select: { namaKelas: true } },
    kelasTujuan: { select: { id: true, namaKelas: true }, orderBy: { namaKelas: 'asc' } }
} satisfies Prisma.UjianSelect;

router.get('/notifikasi', handle(async (_req, res, actor) => {
    const events = await prisma.kegiatanUjian.findMany({
        where: { jenis: 'pelanggaran-ujian', ujian: examScope(actor) },
        orderBy: { id: 'desc' },
        take: 50,
        select: { id: true, pelakuId: true, alasan: true, waktu: true,
            ujian: { select: { judul: true, mapel: { select: { nama: true } } } } }
    });
    const users = events.length ? await prisma.user.findMany({
        where: { id: { in: [...new Set(events.flatMap(event => event.pelakuId ?? []))] } },
        select: { id: true, nama: true, username: true }
    }) : [];
    const names = new Map(users.map(user => [user.id, user.nama || user.username]));
    res.json({ data: events.map(({ pelakuId, ...event }) => ({ ...event, siswa: (pelakuId === null ? undefined : names.get(pelakuId)) ?? 'Peserta ujian' })) });
}));

router.get('/ujian', handle(async (_req, res, actor) => {
    const [pairs, exams, jenisUjian] = await Promise.all([
        actor.role === 'guru' ? actor.pairs : assignments(actor),
        prisma.ujian.findMany({
            where: examScope(actor),
            select: { ...examFields, _count: { select: { soal: true } } },
            orderBy: actor.role === 'admin' ? [{ waktuMulai: 'desc' }, { id: 'desc' }] : { id: 'desc' }
        }),
        prisma.jenisUjian.findMany({ select: { id: true, nama: true, profil: true }, orderBy: { nama: 'asc' } })
    ]);
    res.json({ ujian: exams, penugasan: pairs, jenisUjian: sortByName(jenisUjian, item => item.nama) });
}));

function parseExamSchedule(body: Record<string, unknown>) {
    const { waktuMulai, waktuSelesai, durasiMenit } = body;
    const mulai = new Date(typeof waktuMulai === 'string' ? waktuMulai : '');
    const selesai = new Date(typeof waktuSelesai === 'string' ? waktuSelesai : '');
    if (!validId(durasiMenit) ||
        !Number.isFinite(+mulai) || !Number.isFinite(+selesai) || +selesai - +mulai < durasiMenit * 60000) {
        return null;
    }
    return { waktuMulai: mulai, waktuSelesai: selesai, durasiMenit };
}

function copyQuestions(questions: Prisma.SoalGetPayload<{}>[], draf: boolean) {
    const essayOnly = questions.every(question => question.tipeSoal === 'ESSAY');
    return questions.map(question => ({
        tipeSoal: question.tipeSoal, pertanyaan: question.pertanyaan,
        urutan: question.urutan,
        isi: questionContent(question) ?? Prisma.DbNull, pilihanOpsi: question.pilihanOpsi ?? Prisma.DbNull,
        kunciJawaban: question.kunciJawaban,
        bobot: !draf && essayOnly ? essayLimit(question) : question.bobot
    }));
}

function questionForResponse(question: Prisma.SoalGetPayload<{}>) {
    return { ...question, isi: questionContent(question) };
}

function examTitle(name: string, sourceId: number | null) {
    return sourceId === null ? name : ('Remedial · ' + name).slice(0, 150);
}

router.delete('/ujian/:id', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const deleted = await prisma.ujian.deleteMany({ where: { id, ...examScope(actor), draf: true } });
    if (!deleted.count) return res.status(404).json({ message: 'Draf tidak ditemukan. Ujian yang sudah terbit tidak dapat dihapus.' });
    res.sendStatus(204);
}));

router.patch('/ujian/:id/arsip', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const arsip = req.body?.arsip;
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (typeof arsip !== 'boolean') return res.status(400).json({ message: 'Pilihan arsip tidak valid.' });

    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, select: {
            waktuSelesai: true, diarsipkanPada: true,
            susulan: { orderBy: { waktuSelesai: 'desc' }, take: 1, select: { waktuSelesai: true } }
        } });
        if (!exam) return { status: 404, message: 'Ujian terbit tidak ditemukan.' };
        const now = new Date();
        if (arsip && (exam.waktuSelesai > now || exam.susulan.some(sesi => sesi.waktuSelesai > now))) {
            return { status: 409, message: 'Tunggu semua sesi, termasuk susulan, selesai sebelum mengarsipkan.' };
        }
        const diarsipkanPada = arsip ? exam.diarsipkanPada ?? now : null;
        await tx.ujian.update({ where: { id }, data: { diarsipkanPada } });
        return { status: 200, diarsipkanPada };
    });
    if ('message' in result) return res.status(result.status).json({ message: result.message });
    res.json({ diarsipkanPada: result.diarsipkanPada });
}));

const createDraft = handle(async (req, res, actor) => {
    const sourceId = req.params.id === undefined ? null : Number(req.params.id);
    if (sourceId !== null && !validId(sourceId)) return res.status(404).json({ message: 'Ujian sumber tidak ditemukan.' });
    const { mapelId, jenisUjianId, rilisHasilOtomatis = false, aturanDraf } = req.body ?? {};
    const rules = parseDraftExamRules(aturanDraf);
    if (aturanDraf !== undefined && !rules) return res.status(400).json({ message: 'Aturan draf ujian tidak valid.' });
    if (typeof rilisHasilOtomatis !== 'boolean') return res.status(400).json({ message: 'Pengaturan hasil ujian tidak valid.' });
    const kelasIds = parseClassIds(req.body.kelasIds ?? (req.body.kelasId === undefined ? undefined : [req.body.kelasId]));
    const schedule = parseExamSchedule(req.body);
    if (!schedule || !validId(mapelId) || !kelasIds || !validId(jenisUjianId)) {
        return res.status(400).json({ message: 'Lengkapi jenis ujian, penugasan, dan jadwal. Rentang jadwal harus cukup untuk durasi ujian.' });
    }
    const allowed = actor.role === 'admin'
        ? await Promise.all([prisma.mapel.count({ where: { id: mapelId } }), prisma.kelas.count({ where: { id: { in: kelasIds } } })]).then(([subjects, classes]) => subjects === 1 && classes === kelasIds.length)
        : kelasIds.every(kelasId => actor.pairs.some(pair => pair.mapel.id === mapelId && pair.kelas.id === kelasId));
    if (!allowed) {
        return res.status(403).json({ message: 'Mapel dan kelas ini di luar penugasan Anda.' });
    }
    const jenis = await prisma.jenisUjian.findUnique({ where: { id: jenisUjianId } });
    if (!jenis) return res.status(400).json({ message: 'Jenis ujian tidak tersedia. Muat ulang daftar ujian.' });
    const data = { guruId: actor.id, ...schedule, jenisUjianId, judul: jenis.nama, mapelId, kelasId: kelasIds[0],
        kelasTujuan: { connect: kelasIds.map(id => ({ id })) }, draf: true,
        ...(rules ?? { hasilRilis: rilisHasilOtomatis }) };
    const select = { ...examFields, _count: { select: { soal: true } } } satisfies Prisma.UjianSelect;
    if (sourceId === null) return res.status(201).json(await prisma.ujian.create({ data, select }));

    const copy = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${sourceId} FOR UPDATE`;
        const source = await tx.ujian.findFirst({ where: { id: sourceId, ...examScope(actor), mapelId }, select: {
            draf: true, poinKhusus: true, soal: { where: { dibatalkan: false }, orderBy: { id: 'asc' } }
        } });
        if (!source) return null;
        return tx.ujian.create({
            data: { ...data, poinKhusus: source.poinKhusus ?? Prisma.DbNull,
                soal: { create: copyQuestions(source.soal, source.draf) } },
            select: { ...select, soal: { orderBy: { id: 'asc' } } }
        });
    });
    if (!copy) return res.status(404).json({ message: 'Ujian sumber tidak ditemukan untuk mapel ini.' });
    res.status(201).json(copy);
});

router.post('/ujian', createDraft);
router.post('/ujian/:id/duplikat', createDraft);

const scheduleLockFields = {
    _count: { select: { pengerjaan: true, jawaban: true, kegiatan: { where: { jenis: 'reset-pengerjaan' } } } },
    diarsipkanPada: true
} satisfies Prisma.UjianSelect;

function scheduleLocked(exam: Prisma.UjianGetPayload<{ select: typeof scheduleLockFields }>) {
    return Boolean(exam.diarsipkanPada || exam._count.pengerjaan || exam._count.jawaban || exam._count.kegiatan);
}

router.patch('/ujian/:id/jadwal', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, select: {
            ...scheduleLockFields, durasiMenit: true, waktuMulai: true, waktuSelesai: true
        } });
        if (!exam) return { status: 404, message: 'Ujian terbit tidak ditemukan.' };
        if (scheduleLocked(exam)) return { status: 409, message: 'Jadwal terkunci karena ujian diarsipkan atau peserta sudah mulai mengerjakan.' };
        const schedule = parseExamSchedule({ ...req.body, durasiMenit: exam.durasiMenit });
        if (!schedule || +schedule.waktuSelesai - Math.max(Date.now(), +schedule.waktuMulai) < exam.durasiMenit * 60000) {
            return { status: 400, message: 'Sisa rentang jadwal harus cukup untuk durasi ujian.' };
        }
        const { waktuMulai, waktuSelesai } = schedule;
        await tx.ujian.update({ where: { id }, data: { waktuMulai, waktuSelesai } });
        await tx.kegiatanUjian.create({ data: {
            ujianId: id, pelakuId: actor.id, jenis: 'ubah-jadwal',
            data: { sebelum: { mulai: exam.waktuMulai.toISOString(), selesai: exam.waktuSelesai.toISOString() },
                sesudah: { mulai: waktuMulai.toISOString(), selesai: waktuSelesai.toISOString() } }
        } });
        return { status: 200, jadwal: { waktuMulai, waktuSelesai } };
    });
    if ('message' in result) return res.status(result.status).json({ message: result.message });
    res.json(result.jadwal);
}));

router.get('/ujian/:id', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor) }, select: { ...examFields, soal: { orderBy: { id: 'asc' } } }
    });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    res.json({ ...exam, soal: sortQuestions(exam.soal).map(questionForResponse) });
}));

const allowedImageHosts = (process.env.GAMBAR_HOST_DIIZINKAN ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);

function parseQuestion(input: unknown) {
    if (typeof input !== 'object' || !input) return null;
    const body = input as Record<string, unknown>;
    const tipeSoal = body.tipeSoal;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const pertanyaan = text(body.pertanyaan);
    const image = (value: unknown) => {
        if (!value) return '';
        if (typeof value !== 'string') return null;
        // Unggahan baru datang sebagai data URI dan disimpan menjadi file sebelum soal ditulis ke database;
        // soal yang sudah tersimpan mengirim kembali alamat filenya.
        if (value.startsWith('data:')) return isDataImage(value) ? value : null;
        if (value.startsWith('/media/')) return isMediaPath(value) ? value : null;
        // Gambar dari server luar membuat perangkat siswa menghubungi pihak ketiga saat ujian.
        // Hanya host https yang didaftarkan di GAMBAR_HOST_DIIZINKAN yang diterima; bawaannya tidak ada.
        if (value.length > 2000) return null;
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && allowedImageHosts.includes(url.hostname.toLowerCase()) ? url.href : null;
        } catch { return null; }
    };
    const gambar = image(body.gambar);
    if (gambar === null) return null;
    if (typeof tipeSoal !== 'string' || !pertanyaan || pertanyaan.length > 12000) return null;
    let isi: Prisma.InputJsonObject;
    let bobot = 0;
    if (tipeSoal === 'PG' || tipeSoal === 'PM' || tipeSoal === 'BS') {
        if (!Array.isArray(body.items) || body.items.length < (tipeSoal === 'BS' ? 1 : 2)) return null;
        const items = body.items.map(item => ({ teks: text(item?.teks), benar: item?.benar, gambar: image(item?.gambar) }));
        if (items.some(item => !item.teks || item.teks.length > 12000 || typeof item.benar !== 'boolean' || item.gambar === null)) return null;
        const keys = items.filter(item => item.benar).length;
        if ((tipeSoal === 'PG' && keys !== 1) || (tipeSoal === 'PM' && keys === 0)) return null;
        isi = { items };
    } else if (tipeSoal === 'JODOH') {
        if (!Array.isArray(body.pasangan) || body.pasangan.length < 2 || body.pasangan.length > 20) return null;
        const pasangan = body.pasangan.map(pair => ({ kiri: text(pair?.kiri), kanan: text(pair?.kanan) }));
        if (pasangan.some(({ kiri, kanan }) => !kiri || !kanan || kiri.length > 12000 || kanan.length > 12000) ||
            new Set(pasangan.map(pair => pair.kanan)).size !== pasangan.length) return null;
        isi = { pasangan };
    } else if (tipeSoal === 'ISIAN') {
        if (!Array.isArray(body.jawaban)) return null;
        const jawaban = [...new Set(body.jawaban.map(text).filter(Boolean))];
        if (!jawaban.length) return null;
        isi = { jawaban, angka: body.angka === true };
    } else if (tipeSoal === 'ESSAY') {
        if (!validId(body.poin) || body.poin > 100) return null;
        bobot = body.poin;
        isi = {};
    } else return null;
    return { tipeSoal, pertanyaan, isi: { ...isi, gambar }, bobot };
}

router.get('/soal/template', handle(async (_req, res) => {
    const settings = await readNavbarSettings();
    res.attachment('template-soal.xlsx').send(await questionTemplate(settings?.logo));
}));

router.put('/ujian/:id/draf', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const { perubahan, soalAwal, hapus, jenisUjianId, rilisHasilOtomatis, aturanDraf, urutanSoal } = req.body ?? {};
    const rules = parseDraftExamRules(aturanDraf);
    if (aturanDraf !== undefined && !rules) return res.status(400).json({ message: 'Aturan draf ujian tidak valid.' });
    if (rilisHasilOtomatis !== undefined && typeof rilisHasilOtomatis !== 'boolean') {
        return res.status(400).json({ message: 'Pengaturan hasil ujian tidak valid.' });
    }
    const schedule = parseExamSchedule(req.body ?? {});
    if (!validId(jenisUjianId)) return res.status(400).json({ message: 'Pilih jenis ujian yang tersedia.' });
    if (!schedule || !Array.isArray(perubahan) || perubahan.length > 500 ||
        !Array.isArray(soalAwal) || !soalAwal.every(validId) || !Array.isArray(hapus) || !hapus.every(validId)) {
        return res.status(400).json({ message: 'Periksa jadwal dan durasi ujian. Maksimal 500 soal baru atau diubah per simpan.' });
    }

    const existing = new Set<number>(soalAwal);
    const edited = new Set<number>(hapus);
    if (hapus.some(questionId => !existing.has(questionId)) || edited.size !== hapus.length) return res.status(400).json({ message: 'Daftar soal tidak valid.' });
    const positions = new Map<number, number>();
    const newPositions: number[] = [];
    if (urutanSoal !== undefined) {
        if (!Array.isArray(urutanSoal)) return res.status(400).json({ message: 'Urutan soal tidak valid.' });
        for (const [index, key] of urutanSoal.entries()) {
            if (key === null) newPositions.push(index + 1);
            else {
                if (!validId(key) || !existing.has(key) || edited.has(key) || positions.has(key)) {
                    return res.status(400).json({ message: 'Urutan soal tidak valid.' });
                }
                positions.set(key, index + 1);
            }
        }
        if (positions.size !== existing.size - edited.size || newPositions.length !== perubahan.filter(change => change?.id === null).length) {
            return res.status(400).json({ message: 'Urutan soal tidak lengkap.' });
        }
    }
    const updates = new Map<number, NonNullable<ReturnType<typeof parseQuestion>>>();
    const additions: Prisma.SoalCreateManyInput[] = [];
    for (const change of perubahan) {
        const data = parseQuestion(change?.soal);
        if (!data) {
            const label = validId(change?.nomor) ? 'Soal nomor ' + change.nomor : 'Soal';
            return res.status(400).json({ message: label + ' belum valid. Periksa teks, opsi, pasangan, kunci, atau poin.' });
        }
        if (change.id === null) {
            additions.push({ ujianId: id, ...data, urutan: newPositions[additions.length], isi: await storeQuestionImages(data.isi) });
        } else {
            if (!validId(change.id) || !existing.has(change.id) || edited.has(change.id)) {
                return res.status(400).json({ message: 'Daftar soal tidak valid.' });
            }
            edited.add(change.id);
            updates.set(change.id, { ...data, isi: await storeQuestionImages(data.isi) });
        }
    }

    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({
            where: { id, ...examScope(actor) },
            select: { draf: true, ujianAsalId: true, soal: { select: { id: true, tipeSoal: true, urutan: true } } }
        });
        if (!exam) return { status: 404, message: 'Ujian tidak ditemukan.' };
        if (!exam.draf || exam.soal.length !== existing.size || exam.soal.some(question => !existing.has(question.id)) ||
            (urutanSoal !== undefined && sortQuestions(exam.soal).some((question, index) => question.id !== soalAwal[index]))) {
            return { status: 409, message: 'Draf berubah atau sudah terbit. Buka ulang ujian sebelum menyimpan lagi.' };
        }
        const jenis = await tx.jenisUjian.findUnique({ where: { id: jenisUjianId } });
        if (!jenis) return { status: 400, message: 'Jenis ujian tidak tersedia. Muat ulang daftar ujian.' };
        if (hapus.length) await tx.soal.deleteMany({ where: { ujianId: id, id: { in: hapus } } });
        for (const question of exam.soal) {
            const data = updates.get(question.id);
            const urutan = positions.get(question.id);
            const orderChanged = urutan !== undefined && question.urutan !== urutan;
            if (data || orderChanged) {
                await tx.soal.update({ where: { id: question.id }, data: { ...data, ...(orderChanged && { urutan }) } });
            }
        }
        if (additions.length) await tx.soal.createMany({ data: additions });
        const data = await tx.ujian.update({
            where: { id }, data: { ...schedule, jenisUjianId, judul: examTitle(jenis.nama, exam.ujianAsalId),
                ...(rules ?? { hasilRilis: rilisHasilOtomatis }) },
            select: { ...examFields, soal: { orderBy: { id: 'asc' } } }
        });
        return { status: 200, data: { ...data, soal: sortQuestions(data.soal).map(questionForResponse) } };
    }, { timeout: 20000 });

    if (result.status !== 200) return res.status(result.status).json({ message: result.message });
    res.json(result.data);
}));

router.post('/ujian/:id/soal/import', (req, res, next) => {
    uploadExcel.single('file')(req, res, error => {
        if (error) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran Excel maksimal 5 MB.' : 'Unggah satu file Excel (.xlsx atau .xls).' });
        next();
    });
}, handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({ where: { id, ...examScope(actor) }, select: { draf: true } });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (!exam.draf) return res.status(409).json({ message: 'Impor hanya tersedia untuk ujian draf.' });
    if (!req.file) return res.status(400).json({ message: 'Pilih file Excel terlebih dahulu.' });

    let rows;
    try {
        rows = readQuestionWorkbook(req.file.buffer);
    } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Format Excel tidak valid.' });
    }
    const records: Prisma.SoalCreateManyInput[] = [];
    for (const { row, sheet, question } of rows) {
        const data = parseQuestion(question);
        if (!data) {
            return res.status(400).json({ message: (sheet ? 'Sheet ' + sheet + ', baris ' : 'Blok mulai baris ') + row + ' (' + questionTypeLabels[question.tipeSoal] + ') belum lengkap. Periksa soal, opsi, kunci, jawaban, atau poin.' });
        }
        records.push({ ujianId: id, ...data });
    }
    if (req.query.preview === '1') {
        const counts: Record<string, number> = {};
        for (const { question } of rows) counts[question.tipeSoal] = (counts[question.tipeSoal] ?? 0) + 1;
        return res.json({ jumlah: records.length, counts });
    }
    const soal = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const current = await tx.ujian.findFirst({
            where: { id, ...examScope(actor), draf: true },
            select: { soal: { select: { id: true } } }
        });
        if (!current) return null;
        const existingIds = current.soal.map(q => q.id);
        await tx.soal.createMany({ data: records });
        return tx.soal.findMany({
            where: { ujianId: id, ...(existingIds.length ? { id: { notIn: existingIds } } : {}) },
            orderBy: { id: 'asc' }
        });
    });
    if (!soal) return res.status(409).json({ message: 'Ujian sudah terbit.' });
    res.status(201).json({ soal: soal.sort((a, b) => a.id - b.id) });
}));

router.post('/ujian/:id/soal', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const data = parseQuestion(req.body);
    if (!data) return res.status(400).json({ message: 'Lengkapi Soal, opsi atau pernyataan, kunci, dan poin sesuai tipe.' });
    const exam = await prisma.ujian.findFirst({ where: { id, ...examScope(actor) }, select: { draf: true } });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (!exam.draf) return res.status(409).json({ message: 'Ujian sudah terbit.' });
    data.isi = await storeQuestionImages(data.isi);
    const question = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        if (!await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: true }, select: { id: true } })) return null;
        return tx.soal.create({ data: { ujianId: id, ...data } });
    });
    if (!question) return res.status(409).json({ message: 'Ujian sudah terbit.' });
    res.status(201).json(question);
}));

router.put('/ujian/:id/soal/:soalId', handle(async (req, res, actor) => {
    const ujianId = Number(req.params.id);
    const id = Number(req.params.soalId);
    if (!validId(ujianId) || !validId(id)) return res.status(404).json({ message: 'Soal tidak ditemukan.' });
    const data = parseQuestion(req.body);
    if (!data) return res.status(400).json({ message: 'Lengkapi Soal, opsi atau pernyataan, kunci, dan poin sesuai tipe.' });
    if (!await prisma.ujian.count({ where: { id: ujianId, ...examScope(actor), draf: true } })) return res.status(404).json({ message: 'Soal draf tidak ditemukan.' });
    data.isi = await storeQuestionImages(data.isi);
    const updated = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${ujianId} FOR UPDATE`;
        return tx.soal.updateMany({ where: { id, ujianId, ujian: { ...examScope(actor), draf: true } }, data });
    });
    if (!updated.count) return res.status(404).json({ message: 'Soal draf tidak ditemukan.' });
    res.json(await prisma.soal.findUnique({ where: { id } }));
}));

function makeToken() {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

router.post('/ujian/:id/poin', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor), draf: true },
        select: { soal: { select: { id: true, tipeSoal: true, bobot: true, urutan: true } } }
    });
    if (!exam) return res.status(404).json({ message: 'Draf tidak ditemukan.' });
    try {
        res.json(calculatePoints(sortQuestions(exam.soal), req.body.poinKhusus));
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
}));

router.post('/ujian/:id/terbit', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({
            where: { id, ...examScope(actor), draf: true },
            select: { profil: true, waktuSelesai: true, soal: { orderBy: { id: 'asc' } } }
        });
        if (!exam) return { status: 404, message: 'Draf tidak ditemukan.' };
        if (+exam.waktuSelesai <= Date.now()) return { status: 400, message: 'Jadwal ujian sudah berakhir.' };
        let plan;
        try { plan = calculatePoints(sortQuestions(exam.soal), req.body.poinKhusus); }
        catch (error) { return { status: 400, message: (error as Error).message }; }
        if (JSON.stringify(req.body.pratinjau) !== JSON.stringify(plan.rows)) {
            return { status: 409, message: 'Soal atau poin berubah. Buat pratinjau poin lagi.' };
        }
        for (const row of plan.rows) {
            const original = exam.soal.find(question => question.id === row.id)!;
            await tx.soal.update({ where: { id: row.id }, data: {
                bobot: row.poin,
                ...(original.tipeSoal === 'ESSAY' ? { isi: { ...object(questionContent(original)), poinEssay: essayLimit(original) } as Prisma.InputJsonObject } : {})
            } });
        }
        const updated = await tx.ujian.update({
            where: { id }, data: { draf: false, token: examTokenMode(exam.profil) === 'wajib' ? makeToken() : null, poinKhusus: plan.special },
            select: { ...examFields, soal: { orderBy: { id: 'asc' } } }
        });
        return { status: 200, updated };
    });
    if ('message' in result) return res.status(result.status).json({ message: result.message });
    res.json({ ...result.updated, soal: sortQuestions(result.updated.soal) });
}));

router.patch('/ujian/:id/keamanan', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const weights = parseSecurityWeights(req.body?.weights);
    // Klien lama tidak mengirim batas; pakai bawaan agar tetap berfungsi.
    const limit = req.body?.limit === undefined ? DEFAULT_VIOLATION_LIMIT : parseSecurityLimit(req.body.limit);
    if (!validId(id) || !weights || limit === null) return res.status(400).json({ message: 'Isi bobot risiko dan batas pelanggaran antara 0 dan 10.' });
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, select: scheduleLockFields });
        if (!exam) return 404;
        if (scheduleLocked(exam)) return 409;
        await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'pengaturan-keamanan', data: { ...weights, batas: limit } } });
        return 204;
    });
    if (result === 409) return res.status(409).json({ message: 'Pengaturan keamanan terkunci setelah pengerjaan dimulai atau ujian diarsipkan.' });
    res.sendStatus(result);
}));

router.get('/ujian/:id/sesi', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const siswa = { id: true, username: true, nama: true, role: true };
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor), draf: false },
        select: {
            ...scheduleLockFields, profil: true, durasiMenit: true, ujianAsalId: true, pesertaRemedial: { select: siswa },
            token: true, masukBuka: true, waktuMulai: true, waktuSelesai: true,
            kegiatan: { where: { jenis: 'pengaturan-keamanan' }, orderBy: { id: 'desc' }, take: 1, select: { data: true } },
            kelas: { select: { users: { where: { role: 'siswa' }, select: siswa, orderBy: { nama: 'asc' } } } },
            kelasTujuan: { select: { users: { where: { role: 'siswa' }, select: siswa, orderBy: { nama: 'asc' } } } },
            jawaban: { select: { siswaId: true, totalNilai: true, waktuSubmit: true, siswa: { select: siswa } } },
            pengerjaan: { select: { id: true, siswaId: true, sesiSusulanId: true, mulai: true, batasWaktu: true, waktuKirim: true, siswa: { select: siswa } } },
            susulan: { orderBy: { waktuMulai: 'asc' }, select: {
                id: true, token: true, masukBuka: true, waktuMulai: true, waktuSelesai: true,
                peserta: { select: { siswaId: true, siswa: { select: siswa } } }
            } }
        }
    });
    if (!exam) return res.status(404).json({ message: 'Ujian terbit tidak ditemukan.' });
    const securityLog = await prisma.kegiatanUjian.findMany({
        where: { ujianId: id, jenis: 'pelanggaran-ujian' }, orderBy: { id: 'desc' },
        select: { id: true, pelakuId: true, alasan: true, data: true, waktu: true }
    });
    const { _count, diarsipkanPada, pesertaRemedial, kegiatan, ...session } = exam;
    const security = parseSecurityConfig(kegiatan[0]?.data) ?? defaultSecurityConfig;
    const notes = await prisma.kegiatanUjian.findMany({
        where: { ujianId: id, jenis: 'catatan-pengawas' }, orderBy: { id: 'desc' },
        select: { id: true, data: true, waktu: true, pelaku: { select: { nama: true, username: true } } }
    });
    const pesertaUjiCoba = exam.ujianAsalId === null
        ? await prisma.user.findMany({ where: { role: 'admin' }, select: siswa, orderBy: { nama: 'asc' } }) : [];
    res.json({ ...session, jadwalTerkunci: scheduleLocked({ _count, diarsipkanPada }),
        pesertaUjiCoba,
        kelas: { users: exam.ujianAsalId !== null ? pesertaRemedial : [...new Map([...exam.kelas.users, ...exam.kelasTujuan.flatMap(k => k.users)].map(s => [s.id, s])).values()] },
        bobotKeamanan: security.weights, batasPelanggaran: security.limit,
        catatanPengawas: notes.map(row => ({ id: row.id, teks: typeof object(row.data).teks === 'string' ? object(row.data).teks : '', waktu: row.waktu,
            oleh: row.pelaku ? row.pelaku.nama || row.pelaku.username : 'Akun dihapus' })),
        keamanan: securityLog.map(row => ({ id: row.id, siswaId: row.pelakuId, attemptId: object(row.data).attemptId, reason: row.alasan, waktu: row.waktu,
            bobot: object(row.data).weight ?? defaultSecurityWeights[row.alasan as SecurityEvent['reason']] ?? 0,
            dibatalkan: violationCancellation(row.data) }))
    });
}));

// Penugasan pengawas: guru pemilik ujian (dan admin) menunjuk guru lain untuk mengawasi kelas tertentu.
router.get('/ujian/:id/pengawas', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({ where: { id, ...examScope(actor) }, select: {
        kelas: { select: { id: true, namaKelas: true } }, kelasTujuan: { select: { id: true, namaKelas: true } },
        pengawas: { select: { guruId: true, kelasId: true } }
    } });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const guru = await prisma.user.findMany({ where: { role: 'guru' }, select: { id: true, nama: true, username: true }, orderBy: { nama: 'asc' } });
    const byTeacher = new Map<number, number[]>();
    for (const row of exam.pengawas) byTeacher.set(row.guruId, [...(byTeacher.get(row.guruId) ?? []), row.kelasId]);
    res.json({
        kelas: [...new Map([exam.kelas, ...exam.kelasTujuan].map(item => [item.id, item])).values()].sort((a, b) => a.namaKelas.localeCompare(b.namaKelas)),
        guru, penugasan: [...byTeacher].map(([guruId, kelasIds]) => ({ guruId, kelasIds }))
    });
}));

router.put('/ujian/:id/pengawas', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const result = await prisma.$transaction(async tx => {
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor) }, select: { kelasId: true, kelasTujuan: { select: { id: true } }, diarsipkanPada: true } });
        if (!exam) return 404;
        if (exam.diarsipkanPada) return 409;
        const assignments = parseProctorAssignments(req.body?.penugasan, examClassIds(exam));
        if (!assignments) return 400;
        const teachers = await tx.user.count({ where: { id: { in: assignments.map(item => item.guruId) }, role: 'guru' } });
        if (teachers !== assignments.length) return 400;
        await tx.pengawasUjian.deleteMany({ where: { ujianId: id } });
        if (assignments.length) await tx.pengawasUjian.createMany({
            data: assignments.flatMap(item => item.kelasIds.map(kelasId => ({ ujianId: id, guruId: item.guruId, kelasId })))
        });
        return 204;
    });
    if (result === 404) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (result === 409) return res.status(409).json({ message: 'Ujian sudah diarsipkan.' });
    if (result === 400) return res.status(400).json({ message: 'Pilih guru dan minimal satu kelas ujian untuk setiap pengawas.' });
    res.sendStatus(204);
}));

// Guru membatalkan pelanggaran yang ternyata bukan kecurangan (notifikasi, telepon masuk, gangguan perangkat).
// Catatan tidak dihapus: alasan tertulis disimpan bersama kejadiannya dan masuk log audit.
router.patch('/ujian/:id/pelanggaran/:logId', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const logId = Number(req.params.logId);
    const reason = parseCancelReason(req.body?.alasan);
    if (!validId(id) || !validId(logId)) return res.status(404).json({ message: 'Catatan pelanggaran tidak ditemukan.' });
    if (!reason) return res.status(400).json({ message: 'Tulis alasan pembatalan, 5 sampai 300 karakter.' });
    const result = await prisma.$transaction(async tx => {
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, select: { id: true } });
        return exam ? cancelViolation(tx, id, logId, actor.id, reason) : 404;
    });
    if (result === 404) return res.status(404).json({ message: 'Catatan pelanggaran tidak ditemukan.' });
    if (result === 409) return res.status(409).json({ message: 'Pelanggaran ini sudah dibatalkan.' });
    writeAudit(req, { aksi: 'batalkan-pelanggaran', status: 200, pelakuId: actor.id, pelaku: res.locals.user.username, peran: actor.role,
        target: `ujian ${id} · siswa ${result.pelakuId} · ${result.alasan} · alasan: ${reason}` });
    res.sendStatus(204);
}));

router.post('/ujian/:id/susulan', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const { peserta, waktuMulai, waktuSelesai } = req.body;
    const mulai = new Date(typeof waktuMulai === 'string' ? waktuMulai : '');
    const selesai = new Date(typeof waktuSelesai === 'string' ? waktuSelesai : '');
    if (!Array.isArray(peserta) || !peserta.length || !peserta.every(validId) || new Set(peserta).size !== peserta.length ||
        !Number.isFinite(+mulai) || !Number.isFinite(+selesai) || +selesai <= Date.now()) {
        return res.status(400).json({ message: 'Isi jadwal dan pilih peserta susulan.' });
    }
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, include: { kelasTujuan: { select: { id: true } } } });
        if (!exam) return { status: 404, message: 'Ujian terbit tidak ditemukan.' };
        if (exam.diarsipkanPada) return { status: 409, message: 'Pulihkan ujian sebelum membuat sesi susulan.' };
        if (+selesai - +mulai < exam.durasiMenit * 60000) return { status: 400, message: 'Rentang jadwal harus cukup untuk durasi ujian.' };
        const eligible = await tx.user.count({
            where: { id: { in: peserta },
                ...(exam.ujianAsalId === null
                    ? { OR: [{ role: 'siswa', kelasId: { in: examClassIds(exam) } }, { role: 'admin' }] }
                    : { role: { in: ['siswa', 'admin'] }, pesertaRemedial: { some: { id } } }),
                pengerjaan: { none: { ujianId: id } }, jawaban: { none: { ujianId: id } },
                pesertaSusulan: { none: { sesi: { ujianId: id } } } }
        });
        if (eligible !== peserta.length) return { status: 409, message: 'Ada peserta yang sudah terdaftar di susulan atau sudah mengerjakan.' };
        await tx.sesiSusulan.create({ data: {
            ujianId: id, waktuMulai: mulai, waktuSelesai: selesai, token: examTokenMode(exam.profil) === 'wajib' ? makeToken() : null,
            peserta: { create: peserta.map(siswaId => ({ siswaId })) }
        } });
        return { status: 201, message: 'Sesi susulan dibuat.' };
    });
    res.status(result.status).json({ message: result.message });
}));

router.patch('/ujian/:id/sesi/:sesi', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const regular = req.params.sesi === 'reguler';
    const sesiId = Number(req.params.sesi);
    if (!validId(id) || (!regular && !validId(sesiId))) return res.status(404).json({ message: 'Sesi tidak ditemukan.' });
    const { aksi } = req.body;
    if (!['ganti-token', 'hapus-token', 'buka', 'tutup', 'akhiri'].includes(aksi)) return res.status(400).json({ message: 'Aksi sesi tidak valid.' });
    const now = new Date();
    const data = aksi === 'ganti-token' ? { token: makeToken() } : aksi === 'hapus-token' ? { token: null } : aksi === 'akhiri'
        ? { masukBuka: false, waktuSelesai: now } : { masukBuka: aksi === 'buka' };
    const window = aksi === 'akhiri' ? { waktuMulai: { lte: now }, waktuSelesai: { gt: now } } : { waktuSelesai: { gt: now } };
    const scope = { id, ...examScope(actor), draf: false, diarsipkanPada: null,
        ...(aksi === 'ganti-token' ? { profil: { not: 'latihan-kuis' } } : aksi === 'hapus-token' ? { profil: 'ulangan-harian' } : {}) };
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const updated = regular
            ? await tx.ujian.updateMany({ where: { ...scope, ...window }, data })
            : await tx.sesiSusulan.updateMany({ where: { id: sesiId, ujian: scope, ...window }, data });
        if (updated.count && aksi === 'akhiri') {
            const exam = await tx.ujian.findUniqueOrThrow({ where: { id }, include: gradeInclude });
            await collectAttempts(tx, exam, exam.pengerjaan.filter(attempt =>
                attempt.sesiSusulanId === (regular ? null : sesiId) && !attempt.waktuKirim && !attempt.diterimaOffline), now);
            await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'akhiri-sesi', data: { sesiId: regular ? null : sesiId } } });
        }
        return updated;
    }, { timeout: 20000 });
    if (!result.count) return res.status(409).json({ message: 'Sesi tidak tersedia atau sudah selesai.' });
    res.json({ message: 'Sesi diperbarui.' });
}));

router.delete('/ujian/:id/pengerjaan/:siswaId', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const siswaId = Number(req.params.siswaId);
    if (!validId(id) || !validId(siswaId)) return res.status(404).json({ message: 'Peserta tidak ditemukan.' });
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, select: { id: true, diarsipkanPada: true } });
        if (!exam) return false;
        if (exam.diarsipkanPada) return 'archived';
        const answers = await tx.jawabanSiswa.deleteMany({ where: { ujianId: id, siswaId } });
        const attempts = await tx.pengerjaanUjian.deleteMany({ where: { ujianId: id, siswaId } });
        if (answers.count + attempts.count === 0) return false;
        await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
        await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'reset-pengerjaan', data: { siswaId } } });
        return true;
    });
    if (result === 'archived') return res.status(409).json({ message: 'Pulihkan ujian sebelum mereset pengerjaan.' });
    if (!result) return res.status(404).json({ message: 'Pengerjaan tidak ditemukan.' });
    res.json({ message: 'Pengerjaan telah direset.' });
}));

const gradeInclude = {
    soal: { orderBy: { id: 'asc' as const } },
    susulan: true,
    pengerjaan: { include: { siswa: { select: { id: true, nama: true, username: true } } } },
    jawaban: { orderBy: [{ waktuSubmit: 'desc' as const }, { id: 'desc' as const }], include: { siswa: { select: { id: true, nama: true, username: true, role: true } } } }
} satisfies Prisma.UjianInclude;

type GradeExam = Prisma.UjianGetPayload<{ include: typeof gradeInclude }>;

router.get('/ujian/:id/analitik', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor), draf: false },
        select: {
            kkm: true,
            soal: gradeInclude.soal,
            jawaban: { ...gradeInclude.jawaban, where: { siswa: { role: 'siswa' } } },
            pengerjaan: { where: { siswa: { role: 'siswa' } }, select: { siswaId: true, diterimaOffline: true, siswa: { select: { id: true, nama: true, username: true } } } }
        }
    });
    if (!exam) return res.status(404).json({ message: 'Ujian terbit tidak ditemukan.' });

    const offline = new Map(exam.pengerjaan.filter(row => row.diterimaOffline).map(row => [row.siswaId, row.siswa]));
    const participants = new Map([...offline].map(([siswaId, siswa]) => [siswaId, { siswa, nilai: null as number | null, status: 'Menunggu tinjauan' }]));
    const questionStats = createQuestionStats(sortQuestions(exam.soal));
    let jumlahKiriman = 0;
    let totalSquares = 0;
    for (const answer of exam.jawaban) {
        if (participants.has(answer.siswaId)) continue;
        const result = grade(exam.soal, answer.detailJawaban, answer.koreksiEssay);
        totalSquares += collectQuestionStats(questionStats, answer.detailJawaban, answer.koreksiEssay, result) ** 2;
        jumlahKiriman++;
        participants.set(answer.siswaId, {
            siswa: answer.siswa,
            nilai: result.pending ? null : Number(result.values.totalNilai),
            status: result.pending ? 'Menunggu koreksi' : 'Selesai dinilai'
        });
    }

    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    const where = { ujianId: id, jenis: 'pelanggaran-ujian', pelakuId: { notIn: admins.map(admin => admin.id) } };
    const [events, totalPelanggaran] = await Promise.all([
        prisma.kegiatanUjian.findMany({ where, orderBy: { id: 'desc' }, take: 50,
            select: { id: true, pelakuId: true, alasan: true, waktu: true } }),
        prisma.kegiatanUjian.count({ where })
    ]);
    const users = events.length ? await prisma.user.findMany({
        where: { id: { in: [...new Set(events.flatMap(event => event.pelakuId ?? []))] } },
        select: { id: true, nama: true, username: true }
    }) : [];
    const names = new Map(users.map(user => [user.id, user.nama || user.username]));
    res.json({ rows: [...participants.values()], totalPelanggaran, jumlahKiriman, menungguTinjauan: offline.size,
        kkm: exam.kkm == null ? null : Number(exam.kkm), ...summarizeQuestionStats(questionStats, jumlahKiriman, totalSquares),
        pelanggaran: events.map(({ pelakuId, ...event }) => ({ ...event, siswa: (pelakuId === null ? undefined : names.get(pelakuId)) ?? 'Peserta ujian' })) });
}));

async function collectAttempts(tx: Prisma.TransactionClient, exam: GradeExam, attempts: GradeExam['pengerjaan'], now: Date) {
    if (!attempts.length) return;
    const answered = new Set(exam.jawaban.map(row => row.siswaId));
    for (const attempt of attempts) {
        if (!answered.has(attempt.siswaId)) {
            const detailJawaban = object(attempt.jawabanTersimpan) as Prisma.InputJsonObject;
            const result = grade(exam.soal, detailJawaban, null);
            await tx.jawabanSiswa.create({ data: {
                ujianId: exam.id, siswaId: attempt.siswaId, detailJawaban, ...result.values
            } });
            if (exam.hasilRilis && !result.pending) await tx.notifikasiUjian.create({
                data: { ujianId: exam.id, siswaId: attempt.siswaId, jenis: 'hasil-dirilis' }
            });
        }
        await tx.pengerjaanUjian.update({ where: { id: attempt.id }, data: { waktuKirim: now } });
    }
    await tx.ujian.update({ where: { id: exam.id }, data: { revisiNilai: { increment: 1 } } });
}

export async function collectExpiredAttempts() {
    const now = new Date();
    const grace = new Date(+now - 300000);
    const candidates = await prisma.pengerjaanUjian.findMany({
        where: { waktuKirim: null, diterimaOffline: null, ujian: { draf: false }, OR: [
            { batasWaktu: { lte: grace } },
            { sesiSusulanId: null, ujian: { waktuSelesai: { lte: grace } } },
            { sesiSusulan: { waktuSelesai: { lte: grace } } }
        ] },
        distinct: ['ujianId'], select: { ujianId: true }, take: 10
    });
    for (const { ujianId } of candidates) {
        await lockedExam(ujianId, { id: 0, role: 'admin' }, async (tx, exam) => {
            const eligible = exam.pengerjaan.filter(attempt => {
                if (attempt.waktuKirim || attempt.diterimaOffline) return false;
                const session = exam.susulan.find(s => s.id === attempt.sesiSusulanId) ?? exam;
                return Math.min(+attempt.batasWaktu, +session.waktuSelesai) <= +grace;
            });
            await collectAttempts(tx, exam, eligible, now);
        });
    }
}

function readiness(exam: GradeExam) {
    const now = Date.now();
    const deadlines = exam.pengerjaan.map(item => {
        const session = exam.susulan.find(s => s.id === item.sesiSusulanId) ?? exam;
        return item.waktuKirim ? 0 : Math.min(+item.batasWaktu, +session.waktuSelesai);
    }).filter(deadline => deadline > now);
    const answered = new Set(exam.jawaban.map(row => row.siswaId));
    const automaticPending = exam.pengerjaan.filter(item => {
        const session = exam.susulan.find(s => s.id === item.sesiSusulanId) ?? exam;
        return !answered.has(item.siswaId) && (item.waktuKirim || Math.min(+item.batasWaktu, +session.waktuSelesai) <= now);
    }).length;
    const pendingEssay = exam.jawaban.map(row => grade(exam.soal, row.detailJawaban, row.koreksiEssay).pending);
    return {
        running: deadlines.length, lastDeadline: deadlines.length ? Math.max(...deadlines) : null,
        automaticPending, offlinePending: exam.pengerjaan.filter(item => item.diterimaOffline).length,
        essayPending: pendingEssay.reduce((sum, count) => sum + count, 0),
        studentsPending: pendingEssay.filter(Boolean).length,
        ongoing: +exam.waktuSelesai > now || exam.susulan.some(s => +s.waktuMulai <= now && +s.waktuSelesai > now)
    };
}

async function lockedExam<T>(id: number, actor: Actor, operation: (tx: Prisma.TransactionClient, exam: GradeExam) => Promise<T>) {
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, include: gradeInclude });
        return exam ? operation(tx, exam) : null;
    }, { timeout: 20000 });
}

function reason(value: unknown) {
    return typeof value === 'string' && value.trim() && value.trim().length <= 2000 ? value.trim() : null;
}

function finalStudentScores(exam: GradeExam) {
    const offline = new Set(exam.pengerjaan.filter(row => row.diterimaOffline).map(row => row.siswaId));
    const scores = new Map<number, { siswa: GradeExam['jawaban'][number]['siswa']; nilai: string | null }>();
    for (const row of exam.jawaban) {
        if (!['siswa', 'admin'].includes(row.siswa.role) || scores.has(row.siswaId)) continue;
        const result = grade(exam.soal, row.detailJawaban, row.koreksiEssay);
        scores.set(row.siswaId, { siswa: row.siswa, nilai: result.pending || offline.has(row.siswaId) ? null : result.values.totalNilai });
    }
    return scores;
}

function remedialCandidates(exam: GradeExam, scores = finalStudentScores(exam)) {
    const threshold = exam.kkm === null ? null : Number(exam.kkm);
    return threshold === null ? [] : [...scores.values()].filter(row => row.nilai !== null && Number(row.nilai) < threshold);
}

function remedialBlockers(exam: GradeExam, status: ReturnType<typeof readiness>, correctionStatus?: string) {
    const blockers: string[] = [];
    const now = Date.now();
    if (+exam.waktuSelesai > now) blockers.push('Sesi utama belum berakhir. Jika ujian sudah selesai, pilih Akhiri Sesi di Sesi & Peserta.');
    if (exam.susulan.some(session => +session.waktuSelesai > now)) blockers.push('Masih ada sesi susulan terjadwal atau berlangsung.');
    if (status.running) blockers.push(`${status.running} siswa masih mengerjakan.`);
    if (status.offlinePending) blockers.push(`Tinjau ${status.offlinePending} kiriman offline.`);
    if (status.automaticPending) blockers.push(`${status.automaticPending} pengerjaan masih menunggu penilaian otomatis.`);
    if (status.essayPending) blockers.push(`Selesaikan koreksi ${status.essayPending} jawaban esai.`);
    if (correctionStatus === 'gagal') blockers.push('Penilaian ulang gagal. Ajukan ulang perbaikan soal.');
    else if (correctionStatus && correctionStatus !== 'selesai') blockers.push('Penilaian ulang soal masih diproses.');
    return blockers;
}

function latestCorrectionStatus(db: Prisma.TransactionClient, ujianId: number) {
    return db.kegiatanUjian.findFirst({ where: { ujianId, jenis: 'perbaiki-soal' }, orderBy: { id: 'desc' }, select: { status: true } });
}

router.patch('/ujian/:id/kkm', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.sendStatus(404);
    const { kkm } = req.body ?? {};
    if (typeof kkm !== 'number' || !Number.isFinite(kkm) || kkm < 0 || kkm > 100 || new Prisma.Decimal(kkm).decimalPlaces() > 2) {
        return res.status(400).json({ message: 'KKM harus antara 0 dan 100, maksimal dua angka desimal.' });
    }
    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({
            where: { id, ...examScope(actor), draf: false, ujianAsalId: null },
            select: { remedial: { select: { id: true } } }
        });
        if (!exam) return 404;
        if (exam.remedial) return 409;
        await tx.ujian.update({ where: { id }, data: { kkm } });
        return 204;
    });
    if (result === 409) return res.status(409).json({ message: 'KKM terkunci setelah draf remedial dibuat.' });
    res.sendStatus(result);
}));

router.post('/ujian/:id/remedial', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.sendStatus(404);
    const result = await lockedExam(id, actor, async (tx, exam) => {
        if (exam.ujianAsalId !== null || exam.kkm === null) return { status: 409, message: 'Atur KKM pada ujian asal terlebih dahulu.' };
        const existing = await tx.ujian.findUnique({ where: { ujianAsalId: id }, select: { id: true } });
        if (existing) return { status: 200, id: existing.id };
        const schedule = parseExamSchedule({ ...req.body, durasiMenit: exam.durasiMenit });
        if (!schedule || +schedule.waktuMulai <= Date.now()) return { status: 400, message: 'Pilih jadwal mendatang yang cukup untuk durasi ujian.' };
        const correction = await latestCorrectionStatus(tx, id);
        const blockers = remedialBlockers(exam, readiness(exam), correction?.status);
        if (blockers.length) return { status: 409, message: blockers.join(' ') };
        const candidates = remedialCandidates(exam);
        if (!candidates.length) return { status: 409, message: 'Tidak ada peserta dengan nilai final di bawah KKM.' };
        const source = await tx.ujian.findUniqueOrThrow({ where: { id }, select: { kelasTujuan: { select: { id: true } } } });
        const created = await tx.ujian.create({
            data: {
                ...schedule, draf: true, guruId: actor.id, ujianAsalId: id, mapelId: exam.mapelId, kelasId: exam.kelasId,
                kelasTujuan: { connect: source.kelasTujuan }, jenisUjianId: exam.jenisUjianId, judul: examTitle(exam.judul, id),
                acakSoal: exam.acakSoal, acakOpsi: exam.acakOpsi,
                poinKhusus: exam.poinKhusus ?? Prisma.DbNull, soal: { create: copyQuestions(exam.soal.filter(q => !q.dibatalkan), false) },
                pesertaRemedial: { connect: candidates.map(row => ({ id: row.siswa.id })) }
            }, select: { id: true }
        });
        return { status: 201, id: created.id };
    });
    if (!result) return res.sendStatus(404);
    if ('message' in result) return res.status(result.status).json({ message: result.message });
    res.status(result.status).json({ id: result.id });
}));

router.get('/ujian/:id/rekap', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, include: gradeInclude });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const [history, makeup, remedial, correction] = await Promise.all([
        prisma.kegiatanUjian.findMany({ where: { ujianId: id }, orderBy: { id: 'desc' }, take: 30 }),
        prisma.pesertaSusulan.findMany({ where: { sesi: { ujianId: id } }, select: { siswaId: true } }),
        exam.ujianAsalId === null ? prisma.ujian.findUnique({ where: { ujianAsalId: id }, include: {
            ...gradeInclude, pesertaRemedial: { select: { id: true, nama: true, username: true, role: true } }
        } }) : null,
        exam.ujianAsalId === null ? latestCorrectionStatus(prisma, id) : null
    ]);
    const submitted = new Set(exam.jawaban.map(row => row.siswaId));
    const status = readiness(exam);
    const scores = finalStudentScores(exam);
    const remedialScores = remedial ? finalStudentScores(remedial) : null;
    const blockers = remedialBlockers(exam, status, correction?.status);
    res.json({
        hasilRilis: exam.hasilRilis, bahasanRilis: exam.bahasanRilis,
        readiness: { ...status, makeupPending: new Set(makeup.filter(row => !submitted.has(row.siswaId)).map(row => row.siswaId)).size },
        kkm: exam.kkm === null ? null : Number(exam.kkm), ujianAsalId: exam.ujianAsalId, durasiMenit: exam.durasiMenit,
        remedialReady: blockers.length === 0, remedialBlockers: blockers,
        candidates: remedial ? [] : remedialCandidates(exam, scores),
        remedial: remedial ? { id: remedial.id, draf: remedial.draf, rows: remedial.pesertaRemedial.map(siswa => ({
            siswa, nilai: scores.get(siswa.id)?.nilai ?? null, nilaiRemedial: remedialScores?.get(siswa.id)?.nilai ?? null
        })) } : null,
        history,
        offline: exam.pengerjaan.filter(row => row.diterimaOffline).map(row => ({
            id: row.id, siswa: row.siswa, diterima: row.diterimaOffline,
            jumlahLokal: Object.keys(object(row.kirimanOffline)).length, jumlahServer: Object.keys(object(row.jawabanTersimpan)).length
        })),
        rows: exam.jawaban.map(row => {
            const result = grade(exam.soal, row.detailJawaban, row.koreksiEssay);
            return {
                id: row.id, siswa: row.siswa, nilai: result.values.totalNilai, pending: result.pending, rincian: result.rincian, penilaian: result.penilaian, jawaban: object(row.detailJawaban),
                essay: exam.soal.filter(q => q.tipeSoal === 'ESSAY' && !q.dibatalkan).map(q => ({
                    id: q.id, soal: q.pertanyaan, maksimum: essayLimit(q),
                    jawaban: object(row.detailJawaban)[q.id] ?? '', nilai: object(row.koreksiEssay)[q.id] ?? null,
                    catatan: object(object(row.koreksiEssay).catatan)[q.id] ?? ''
                }))
            };
        })
    });
}));

router.get('/ujian/:id/rekap/excel', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, include: gradeInclude });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const settings = await readNavbarSettings();
    const rows = exam.jawaban.map(row => {
        const result = grade(exam.soal, row.detailJawaban, row.koreksiEssay);
        return {
            nis: row.siswa.username, nama: row.siswa.nama ?? '', poinOtomatis: Number(result.values.nilaiPg),
            poinEssay: Number(result.values.nilaiEssay), total: Number(result.values.totalNilai),
            status: result.pending ? 'Menunggu koreksi' : 'Selesai'
        };
    });
    res.attachment('rekap-ujian-' + id + '.xlsx').send(await examReportWorkbook(exam.judul, rows, settings?.logo ?? 'smpip'));
}));

router.put('/ujian/:id/rekap/:jawabanId/essay/:soalId?', handle(async (req, res, actor) => {
    const [id, jawabanId] = [req.params.id, req.params.jawabanId].map(Number);
    if (![id, jawabanId].every(validId)) return res.status(404).json({ message: 'Koreksi tidak ditemukan.' });
    const entries: unknown = req.params.soalId
        ? [{ soalId: Number(req.params.soalId), nilai: req.body.nilai, alasan: req.body.alasan, catatan: req.body.catatan }]
        : req.body.nilai;
    if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ message: 'Isi nilai essay terlebih dahulu.' });
    const result = await lockedExam(id, actor, async (tx, exam) => {
        const answer = exam.jawaban.find(row => row.id === jawabanId);
        if (!answer) return 'Jawaban tidak ditemukan.';
        const manual = { ...object(answer.koreksiEssay) } as Prisma.InputJsonObject;
        const notes = { ...object(manual.catatan) } as Record<string, Prisma.InputJsonValue>;
        const changes: { soalId: number; lama: number | null; baru: number; alasan: string | null }[] = [];
        const seen = new Set<number>();
        for (const entry of entries) {
            const { soalId, nilai } = entry ?? {};
            const question = exam.soal.find(q => q.id === soalId && q.tipeSoal === 'ESSAY' && !q.dibatalkan);
            if (!question || seen.has(soalId)) return 'Soal essay tidak ditemukan atau dikirim dua kali.';
            seen.add(soalId);
            if (!Number.isInteger(nilai) || nilai < 0 || nilai > essayLimit(question)) return 'Nilai harus bilangan bulat dalam batas poin soal.';
            if (entry.catatan !== undefined && (typeof entry.catatan !== 'string' || entry.catatan.length > 2000)) return 'Catatan maksimal 2000 karakter.';
            const note = entry.catatan === undefined ? String(notes[soalId] ?? '') : entry.catatan.trim();
            const previous = object(answer.koreksiEssay)[soalId];
            if (previous === nilai && note === String(notes[soalId] ?? '')) continue;
            notes[soalId] = note;
            const alasan = reason(entry.alasan);
            changes.push({ soalId, lama: typeof previous === 'number' ? previous : null, baru: nilai, alasan });
        }
        if (!changes.length) return '';
        const updated = { ...manual, catatan: notes, ...Object.fromEntries(changes.map(change => [change.soalId, change.baru])) };
        const current = grade(exam.soal, answer.detailJawaban, updated);
        const old = grade(exam.soal, answer.detailJawaban, answer.koreksiEssay);
        await tx.jawabanSiswa.update({ where: { id: jawabanId }, data: { ...current.values, koreksiEssay: updated } });
        await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
        await tx.kegiatanUjian.createMany({ data: changes.map(({ alasan, ...change }) => ({
            ujianId: id, pelakuId: actor.id, jenis: 'koreksi-essay', alasan, data: { jawabanId, ...change }
        })) });
        if (exam.hasilRilis && !current.pending && (old.pending || old.values.totalNilai !== current.values.totalNilai)) {
            await tx.notifikasiUjian.create({ data: { ujianId: id, siswaId: answer.siswaId, jenis: old.pending ? 'hasil-dirilis' : 'nilai-diperbarui' } });
        }
        return '';
    });
    if (result) return res.status(400).json({ message: result });
    if (result === null) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    res.json({ message: 'Koreksi disimpan.' });
}));

function comparableAnswer(value: unknown, type: string) {
    if (isBlankAnswer(value)) return null;
    return type === 'PM' && Array.isArray(value) ? [...value].sort((a, b) => a - b) : value;
}

router.get('/ujian/:id/offline/:attemptId', handle(async (req, res, actor) => {
    const id = Number(req.params.id), attemptId = Number(req.params.attemptId);
    if (!validId(id) || !validId(attemptId)) return res.sendStatus(404);
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor), draf: false },
        select: {
            soal: { select: { id: true, tipeSoal: true, urutan: true } },
            pengerjaan: { where: { id: attemptId, diterimaOffline: { not: null } },
                select: { kirimanOffline: true, jawabanTersimpan: true } }
        }
    });
    const attempt = exam?.pengerjaan[0];
    if (!exam || !attempt) return res.status(404).json({ message: 'Kiriman offline tidak ditemukan atau sudah ditinjau.' });
    const local = object(attempt.kirimanOffline), server = object(attempt.jawabanTersimpan);
    const perbedaan = sortQuestions(exam.soal).flatMap((q, index) => {
        const lokal = comparableAnswer(local[q.id], q.tipeSoal);
        const tersimpan = comparableAnswer(server[q.id], q.tipeSoal);
        return isDeepStrictEqual(lokal, tersimpan) ? [] : [{ soalId: q.id, nomor: index + 1, lokal, server: tersimpan }];
    });
    res.json({ perbedaan });
}));

router.patch('/ujian/:id/offline/:attemptId', handle(async (req, res, actor) => {
    const id = Number(req.params.id), attemptId = Number(req.params.attemptId);
    const { terima } = req.body;
    if (!validId(id) || !validId(attemptId) || typeof terima !== 'boolean') return res.status(400).json({ message: 'Pilih keputusan tinjauan.' });
    const done = await lockedExam(id, actor, async (tx, exam) => {
        const attempt = exam.pengerjaan.find(row => row.id === attemptId && row.diterimaOffline);
        if (!attempt) return false;
        const answer = exam.jawaban.find(row => row.siswaId === attempt.siswaId);
        const raw = object(terima ? attempt.kirimanOffline : attempt.jawabanTersimpan) as Prisma.InputJsonObject;
        const previousAnswers = object(answer?.detailJawaban);
        const manual = { ...object(answer?.koreksiEssay) };
        const catatan = { ...object(manual.catatan) };
        const changedEssays = exam.soal.filter(q => q.tipeSoal === 'ESSAY' && !q.dibatalkan &&
            !isDeepStrictEqual(comparableAnswer(raw[q.id], q.tipeSoal), comparableAnswer(previousAnswers[q.id], q.tipeSoal)));
        for (const q of changedEssays) {
            delete manual[q.id];
            delete catatan[q.id];
        }
        const correction = { ...manual, catatan } as Prisma.InputJsonObject;
        const marks = grade(exam.soal, raw, correction);
        const data = { detailJawaban: raw, ...marks.values };
        if (answer) await tx.jawabanSiswa.update({ where: { id: answer.id }, data: { ...data, ...(changedEssays.length ? { koreksiEssay: correction } : {}) } });
        else await tx.jawabanSiswa.create({ data: { ...data, ujianId: id, siswaId: attempt.siswaId } });
        await tx.pengerjaanUjian.update({ where: { id: attemptId }, data: { kirimanOffline: Prisma.DbNull, diterimaOffline: null, waktuKirim: attempt.waktuKirim ?? new Date() } });
        await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
        await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'tinjauan-offline', data: { attemptId, siswaId: attempt.siswaId, terima } } });
        const previous = answer ? grade(exam.soal, answer.detailJawaban, answer.koreksiEssay) : null;
        if (exam.hasilRilis && !marks.pending && (!previous || previous.pending || previous.values.totalNilai !== marks.values.totalNilai)) {
            await tx.notifikasiUjian.create({ data: {
                ujianId: id, siswaId: attempt.siswaId, jenis: !previous || previous.pending ? 'hasil-dirilis' : 'nilai-diperbarui'
            } });
        }
        return true;
    });
    if (!done) return res.status(404).json({ message: 'Kiriman offline tidak ditemukan.' });
    res.json({ message: 'Tinjauan disimpan.' });
}));

router.patch('/ujian/:id/rilis', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const { jenis, rilis } = req.body;
    if (!validId(id) || !['hasil', 'pembahasan'].includes(jenis) || typeof rilis !== 'boolean') return res.status(400).json({ message: 'Aksi rilis tidak valid.' });
    const result = await lockedExam(id, actor, async (tx, exam) => {
        if ((jenis === 'hasil' ? exam.hasilRilis : exam.bahasanRilis) === rilis) return '';
        const ready = readiness(exam);
        const queued = await tx.kegiatanUjian.count({ where: { ujianId: id, status: 'antre' } });
        if (rilis && (ready.ongoing || ready.running || queued || (jenis === 'hasil' && (ready.essayPending || ready.automaticPending || ready.offlinePending)))) {
            return 'Selesaikan sesi, penilaian, dan pekerjaan tertunda sebelum merilis.';
        }
        if (rilis && jenis === 'hasil') {
            for (const row of exam.jawaban) await tx.jawabanSiswa.update({
                where: { id: row.id }, data: grade(exam.soal, row.detailJawaban, row.koreksiEssay).values
            });
        }
        await tx.ujian.update({ where: { id }, data: jenis === 'hasil' ? { hasilRilis: rilis } : { bahasanRilis: rilis } });
        await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: rilis ? jenis + '-dirilis' : jenis + '-disembunyikan' } });
        const students = [...new Set(exam.jawaban.map(row => row.siswaId))];
        if (rilis && students.length) await tx.notifikasiUjian.createMany({
            data: students.map(siswaId => ({ siswaId, ujianId: id, jenis: jenis + '-dirilis' }))
        });
        return '';
    });
    if (result === null) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (result) return res.status(409).json({ message: result });
    res.json({ message: 'Pengaturan rilis disimpan.' });
}));

function impact(exam: GradeExam, revised: GradeExam['soal']) {
    const totals = { naik: 0, turun: 0, tetap: 0 };
    for (const answer of exam.jawaban) {
        const old = Number(grade(exam.soal, answer.detailJawaban, answer.koreksiEssay).values.totalNilai);
        const next = Number(grade(revised, answer.detailJawaban, answer.koreksiEssay).values.totalNilai);
        totals[next > old ? 'naik' : next < old ? 'turun' : 'tetap']++;
    }
    return totals;
}

router.post('/ujian/:id/perbaiki', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    const { soalId, aksi, input, konfirmasi, revisi } = req.body;
    const alasan = reason(req.body.alasan);
    if (!validId(id) || !validId(soalId) || !alasan) return res.status(400).json({ message: 'Pilih soal dan isi alasan.' });
    const result = await lockedExam(id, actor, async (tx, exam) => {
        if (readiness(exam).ongoing || readiness(exam).running) return { status: 409, message: 'Perbaikan tersedia setelah ujian selesai.' };
        if (await tx.kegiatanUjian.count({ where: { ujianId: id, status: 'antre' } })) return { status: 409, message: 'Tunggu penilaian ulang sebelumnya.' };
        let updated;
        try { updated = revise(exam.soal, soalId, aksi, input, exam.poinKhusus) as GradeExam['soal']; }
        catch (error) { return { status: 400, message: (error as Error).message }; }
        const counts = impact(exam, updated);
        if (konfirmasi !== true) return { status: 200, ...counts, revisi: exam.revisiNilai };
        if (revisi !== exam.revisiNilai) return { status: 409, message: 'Nilai berubah. Buat pratinjau dampak ulang.' };
        const job = await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'perbaiki-soal', alasan, status: 'antre',
            data: { soalId, aksi, input: input ?? null, dampak: counts } } });
        return { status: 202, jobId: job.id };
    });
    if (!result) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    res.status(result.status).json(result);
}));

export async function processCorrectionQueue() {
    const job = await prisma.kegiatanUjian.findFirst({ where: { status: 'antre', jenis: 'perbaiki-soal' }, orderBy: { id: 'asc' } });
    if (!job) return;
    try {
        await lockedExam(job.ujianId, { id: job.pelakuId ?? 0, role: 'admin' }, async (tx, exam) => {
            const current = await tx.kegiatanUjian.findFirst({ where: { id: job.id, status: 'antre' } });
            if (!current) return;
            const payload = object(current.data);
            const updated = revise(exam.soal, Number(payload.soalId), payload.aksi, payload.input, exam.poinKhusus);
            const previous = exam.soal.map(q => ({ id: q.id, bobot: q.bobot.toString(), isi: q.isi, dibatalkan: q.dibatalkan, semuaBenar: q.semuaBenar }));
            for (const question of updated) await tx.soal.update({ where: { id: question.id },
                data: { isi: question.isi === null ? Prisma.DbNull : question.isi, bobot: question.bobot, dibatalkan: question.dibatalkan, semuaBenar: question.semuaBenar } });
            const changed = new Set<number>();
            for (const answer of exam.jawaban) {
                const old = grade(exam.soal, answer.detailJawaban, answer.koreksiEssay);
                const next = grade(updated, answer.detailJawaban, answer.koreksiEssay);
                await tx.jawabanSiswa.update({ where: { id: answer.id }, data: next.values });
                if (!next.pending && old.values.totalNilai !== next.values.totalNilai) changed.add(answer.siswaId);
            }
            if (exam.hasilRilis && changed.size) await tx.notifikasiUjian.createMany({
                data: [...changed].map(siswaId => ({ siswaId, ujianId: exam.id, jenis: 'nilai-diperbarui' }))
            });
            await tx.ujian.update({ where: { id: exam.id }, data: { revisiNilai: { increment: 1 } } });
            await tx.kegiatanUjian.update({ where: { id: job.id }, data: { status: 'selesai', data: { ...payload, sebelumnya: previous } as Prisma.InputJsonObject } });
        });
    } catch (error) {
        console.error('Penilaian ulang gagal:', error);
        await prisma.kegiatanUjian.updateMany({ where: { id: job.id, status: 'antre' }, data: { status: 'gagal' } });
    }
}

export default router;

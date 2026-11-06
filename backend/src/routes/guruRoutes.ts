import ExcelJS from 'exceljs';
import { Request, Response, Router } from 'express';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { requireUser } from '../middleware/auth';
import { uploadExcel } from '../middleware/upload';
import { questionTemplate, questionTypeLabels, readQuestionWorkbook } from './questionWorkbook';
import { readNavbarSettings } from '../controllers/navbarController';
import { calculatePoints } from './examPoints';
import { essayLimit, grade, object, revise } from './examGrading';
import { examClassIds, parseClassIds } from './examClasses';

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
    id: true, judul: true, waktuMulai: true, waktuSelesai: true, durasiMenit: true, draf: true,
    mapel: { select: { nama: true } }, kelas: { select: { namaKelas: true } },
    kelasTujuan: { select: { id: true, namaKelas: true }, orderBy: { namaKelas: 'asc' } }
} satisfies Prisma.UjianSelect;

router.get('/ujian', handle(async (_req, res, actor) => {
    const [pairs, exams] = await Promise.all([
        actor.role === 'guru' ? actor.pairs : assignments(actor),
        prisma.ujian.findMany({
            where: examScope(actor),
            select: { ...examFields, _count: { select: { soal: true } } },
            orderBy: actor.role === 'admin' ? [{ waktuMulai: 'desc' }, { id: 'desc' }] : { id: 'desc' }
        })
    ]);
    res.json({ ujian: exams, penugasan: pairs });
}));

function parseExamSchedule(body: Record<string, unknown>) {
    const { judul, waktuMulai, waktuSelesai, durasiMenit } = body;
    const mulai = new Date(typeof waktuMulai === 'string' ? waktuMulai : '');
    const selesai = new Date(typeof waktuSelesai === 'string' ? waktuSelesai : '');
    if (typeof judul !== 'string' || !judul.trim() || judul.trim().length > 150 ||
        !validId(durasiMenit) ||
        !Number.isFinite(+mulai) || !Number.isFinite(+selesai) || +selesai - +mulai < durasiMenit * 60000) {
        return null;
    }
    return { judul: judul.trim(), waktuMulai: mulai, waktuSelesai: selesai, durasiMenit };
}

router.post('/ujian', handle(async (req, res, actor) => {
    const { mapelId } = req.body;
    const kelasIds = parseClassIds(req.body.kelasIds ?? (req.body.kelasId === undefined ? undefined : [req.body.kelasId]));
    const schedule = parseExamSchedule(req.body);
    if (!schedule || !validId(mapelId) || !kelasIds) {
        return res.status(400).json({ message: 'Lengkapi judul, penugasan, dan jadwal. Rentang jadwal harus cukup untuk durasi ujian.' });
    }
    const allowed = actor.role === 'admin'
        ? await Promise.all([prisma.mapel.count({ where: { id: mapelId } }), prisma.kelas.count({ where: { id: { in: kelasIds } } })]).then(([subjects, classes]) => subjects === 1 && classes === kelasIds.length)
        : kelasIds.every(kelasId => actor.pairs.some(pair => pair.mapel.id === mapelId && pair.kelas.id === kelasId));
    if (!allowed) {
        return res.status(403).json({ message: 'Mapel dan kelas ini di luar penugasan Anda.' });
    }
    const exam = await prisma.ujian.create({
        data: { guruId: actor.id, ...schedule, mapelId, kelasId: kelasIds[0], kelasTujuan: { connect: kelasIds.map(id => ({ id })) }, draf: true },
        select: { ...examFields, _count: { select: { soal: true } } }
    });
    res.status(201).json(exam);
}));

router.get('/ujian/:id', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor) }, select: { ...examFields, soal: { orderBy: { id: 'asc' } } }
    });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    res.json(exam);
}));

function parseQuestion(input: unknown) {
    if (typeof input !== 'object' || !input) return null;
    const body = input as Record<string, unknown>;
    const tipeSoal = body.tipeSoal;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const pertanyaan = text(body.pertanyaan);
    const image = (value: unknown) => {
        if (!value) return '';
        if (typeof value !== 'string') return null;
        if (value.startsWith('data:')) {
            return value.length <= 700000 && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
        }
        if (value.length > 2000) return null;
        try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
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
        if ((tipeSoal === 'PG' && keys !== 1) || (tipeSoal === 'PM' && keys < 2)) return null;
        isi = { items };
    } else if (tipeSoal === 'ISIAN') {
        if (!Array.isArray(body.jawaban)) return null;
        const jawaban = [...new Set(body.jawaban.map(text).filter(Boolean))];
        if (!jawaban.length) return null;
        isi = { jawaban, angka: body.angka === true };
    } else if (tipeSoal === 'ESSAY') {
        if (!validId(body.poin) || body.poin > 100) return null;
        bobot = body.poin;
        isi = { pedoman: text(body.pedoman) };
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
    const { perubahan, soalAwal, hapus } = req.body ?? {};
    const schedule = parseExamSchedule(req.body ?? {});
    if (!schedule || !Array.isArray(perubahan) || perubahan.length > 500 ||
        !Array.isArray(soalAwal) || !soalAwal.every(validId) || !Array.isArray(hapus) || !hapus.every(validId)) {
        return res.status(400).json({ message: 'Periksa jadwal dan durasi ujian. Maksimal 500 soal baru atau diubah per simpan.' });
    }

    const existing = new Set<number>(soalAwal);
    const edited = new Set<number>(hapus);
    if (hapus.some(questionId => !existing.has(questionId))) return res.status(400).json({ message: 'Daftar soal tidak valid.' });
    const updates: { id: number; data: NonNullable<ReturnType<typeof parseQuestion>> }[] = [];
    const additions: Prisma.SoalCreateManyInput[] = [];
    for (const change of perubahan) {
        const data = parseQuestion(change?.soal);
        if (!data) {
            const label = validId(change?.nomor) ? 'Soal nomor ' + change.nomor : 'Soal';
            return res.status(400).json({ message: label + ' belum lengkap. Periksa teks, opsi, kunci, atau poin.' });
        }
        if (change.id === null) {
            additions.push({ ujianId: id, ...data });
        } else {
            if (!validId(change.id) || !existing.has(change.id) || edited.has(change.id)) {
                return res.status(400).json({ message: 'Daftar soal tidak valid.' });
            }
            edited.add(change.id);
            updates.push({ id: change.id, data });
        }
    }

    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        const exam = await tx.ujian.findFirst({
            where: { id, ...examScope(actor) },
            select: { draf: true, soal: { select: { id: true } } }
        });
        if (!exam) return { status: 404, message: 'Ujian tidak ditemukan.' };
        if (!exam.draf || exam.soal.length !== existing.size || exam.soal.some(question => !existing.has(question.id))) {
            return { status: 409, message: 'Draf berubah atau sudah terbit. Buka ulang ujian sebelum menyimpan lagi.' };
        }
        if (hapus.length) await tx.soal.deleteMany({ where: { ujianId: id, id: { in: hapus } } });
        for (const update of updates) {
            await tx.soal.update({ where: { id: update.id }, data: update.data });
        }
        if (additions.length) await tx.soal.createMany({ data: additions });
        const data = await tx.ujian.update({
            where: { id }, data: schedule,
            select: { ...examFields, soal: { orderBy: { id: 'asc' } } }
        });
        return { status: 200, data };
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
    const soal = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ujian WHERE id = ${id} FOR UPDATE`;
        if (!await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: true }, select: { id: true } })) return null;
        return tx.soal.createManyAndReturn({ data: records });
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
        select: { soal: { orderBy: { id: 'asc' }, select: { id: true, tipeSoal: true, bobot: true } } }
    });
    if (!exam) return res.status(404).json({ message: 'Draf tidak ditemukan.' });
    try {
        res.json(calculatePoints(exam.soal, req.body.poinKhusus));
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
            select: { waktuSelesai: true, soal: { orderBy: { id: 'asc' } } }
        });
        if (!exam) return { status: 404, message: 'Draf tidak ditemukan.' };
        if (+exam.waktuSelesai <= Date.now()) return { status: 400, message: 'Jadwal ujian sudah berakhir.' };
        let plan;
        try { plan = calculatePoints(exam.soal, req.body.poinKhusus); }
        catch (error) { return { status: 400, message: (error as Error).message }; }
        if (JSON.stringify(req.body.pratinjau) !== JSON.stringify(plan.rows)) {
            return { status: 409, message: 'Soal atau poin berubah. Buat pratinjau poin lagi.' };
        }
        for (const row of plan.rows) {
            const original = exam.soal.find(question => question.id === row.id)!;
            await tx.soal.update({ where: { id: row.id }, data: {
                bobot: row.poin,
                ...(original.tipeSoal === 'ESSAY' ? { isi: { ...object(original.isi), poinEssay: essayLimit(original) } as Prisma.InputJsonObject } : {})
            } });
        }
        const updated = await tx.ujian.update({
            where: { id }, data: { draf: false, token: makeToken(), poinKhusus: plan.special },
            select: { ...examFields, soal: { orderBy: { id: 'asc' } } }
        });
        return { status: 200, updated };
    });
    if ('message' in result) return res.status(result.status).json({ message: result.message });
    res.json(result.updated);
}));

router.get('/ujian/:id/sesi', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const siswa = { id: true, username: true, nama: true };
    const exam = await prisma.ujian.findFirst({
        where: { id, ...examScope(actor), draf: false },
        select: {
            token: true, masukBuka: true, waktuMulai: true, waktuSelesai: true,
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
    res.json({ ...exam,
        kelas: { users: [...new Map([...exam.kelas.users, ...exam.kelasTujuan.flatMap(k => k.users)].map(s => [s.id, s])).values()] },
        keamanan: securityLog.map(row => ({ id: row.id, siswaId: row.pelakuId, attemptId: object(row.data).attemptId, reason: row.alasan, waktu: row.waktu }))
    });
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
        if (+selesai - +mulai < exam.durasiMenit * 60000) return { status: 400, message: 'Rentang jadwal harus cukup untuk durasi ujian.' };
        const eligible = await tx.user.count({
            where: { id: { in: peserta }, role: 'siswa', kelasId: { in: examClassIds(exam) },
                pengerjaan: { none: { ujianId: id } }, jawaban: { none: { ujianId: id } },
                pesertaSusulan: { none: { sesi: { ujianId: id } } } }
        });
        if (eligible !== peserta.length) return { status: 409, message: 'Ada peserta yang sudah terdaftar di susulan atau sudah mengerjakan.' };
        await tx.sesiSusulan.create({ data: {
            ujianId: id, waktuMulai: mulai, waktuSelesai: selesai, token: makeToken(),
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
    if (!['ganti-token', 'buka', 'tutup', 'akhiri'].includes(aksi)) return res.status(400).json({ message: 'Aksi sesi tidak valid.' });
    const now = new Date();
    const data = aksi === 'ganti-token' ? { token: makeToken() } : aksi === 'akhiri'
        ? { masukBuka: false, waktuSelesai: now } : { masukBuka: aksi === 'buka' };
    const window = aksi === 'akhiri' ? { waktuMulai: { lte: now }, waktuSelesai: { gt: now } } : { waktuSelesai: { gt: now } };
    const scope = { id, ...examScope(actor), draf: false };
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
        const exam = await tx.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, select: { id: true } });
        if (!exam) return false;
        const answers = await tx.jawabanSiswa.deleteMany({ where: { ujianId: id, siswaId } });
        const attempts = await tx.pengerjaanUjian.deleteMany({ where: { ujianId: id, siswaId } });
        if (answers.count + attempts.count === 0) return false;
        await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
        await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'reset-pengerjaan', data: { siswaId } } });
        return true;
    });
    if (!result) return res.status(404).json({ message: 'Pengerjaan tidak ditemukan.' });
    res.json({ message: 'Pengerjaan telah direset.' });
}));

const gradeInclude = {
    soal: { orderBy: { id: 'asc' as const } },
    susulan: true,
    pengerjaan: { include: { siswa: { select: { id: true, nama: true, username: true } } } },
    jawaban: { orderBy: { waktuSubmit: 'desc' as const }, include: { siswa: { select: { id: true, nama: true, username: true } } } }
} satisfies Prisma.UjianInclude;

type GradeExam = Prisma.UjianGetPayload<{ include: typeof gradeInclude }>;

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

router.get('/ujian/:id/rekap', handle(async (req, res, actor) => {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const exam = await prisma.ujian.findFirst({ where: { id, ...examScope(actor), draf: false }, include: gradeInclude });
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    const [history, makeup] = await Promise.all([
        prisma.kegiatanUjian.findMany({ where: { ujianId: id }, orderBy: { id: 'desc' }, take: 30 }),
        prisma.pesertaSusulan.findMany({ where: { sesi: { ujianId: id } }, select: { siswaId: true } })
    ]);
    const submitted = new Set(exam.jawaban.map(row => row.siswaId));
    res.json({
        hasilRilis: exam.hasilRilis, bahasanRilis: exam.bahasanRilis,
        readiness: { ...readiness(exam), makeupPending: new Set(makeup.filter(row => !submitted.has(row.siswaId)).map(row => row.siswaId)).size },
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
                    id: q.id, soal: q.pertanyaan, pedoman: object(q.isi).pedoman, maksimum: essayLimit(q),
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
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rekap Nilai');
    sheet.columns = [
        { header: 'NIS', width: 20 }, { header: 'Nama siswa', width: 32 },
        { header: 'Poin otomatis', width: 18 }, { header: 'Poin essay', width: 18 },
        { header: 'Total', width: 12 }, { header: 'Status', width: 24 }
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of exam.jawaban) {
        const result = grade(exam.soal, row.detailJawaban, row.koreksiEssay);
        sheet.addRow([row.siswa.username, row.siswa.nama ?? '', Number(result.values.nilaiPg),
            Number(result.values.nilaiEssay), Number(result.values.totalNilai), result.pending ? 'Menunggu koreksi' : 'Selesai']);
    }
    res.attachment('rekap-ujian-' + id + '.xlsx').send(Buffer.from(await workbook.xlsx.writeBuffer()));
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

router.patch('/ujian/:id/offline/:attemptId', handle(async (req, res, actor) => {
    const id = Number(req.params.id), attemptId = Number(req.params.attemptId);
    const { terima } = req.body;
    if (!validId(id) || !validId(attemptId) || typeof terima !== 'boolean') return res.status(400).json({ message: 'Pilih keputusan tinjauan.' });
    const done = await lockedExam(id, actor, async (tx, exam) => {
        const attempt = exam.pengerjaan.find(row => row.id === attemptId && row.diterimaOffline);
        if (!attempt) return false;
        const answer = exam.jawaban.find(row => row.siswaId === attempt.siswaId);
        const raw = object(terima ? attempt.kirimanOffline : attempt.jawabanTersimpan) as Prisma.InputJsonObject;
        const marks = grade(exam.soal, raw, answer?.koreksiEssay);
        const data = { detailJawaban: raw, ...marks.values };
        if (answer) await tx.jawabanSiswa.update({ where: { id: answer.id }, data });
        else await tx.jawabanSiswa.create({ data: { ...data, ujianId: id, siswaId: attempt.siswaId } });
        await tx.pengerjaanUjian.update({ where: { id: attemptId }, data: { kirimanOffline: Prisma.DbNull, diterimaOffline: null, waktuKirim: attempt.waktuKirim ?? new Date() } });
        await tx.ujian.update({ where: { id }, data: { revisiNilai: { increment: 1 } } });
        await tx.kegiatanUjian.create({ data: { ujianId: id, pelakuId: actor.id, jenis: 'tinjauan-offline', data: { attemptId, terima } } });
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
        await lockedExam(job.ujianId, { id: job.pelakuId, role: 'admin' }, async (tx, exam) => {
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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { remedialAccess } from '../src/routes/examClasses';

test('remedial selects students and test admins with final scores strictly below KKM', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/guruRoutes')
    ]);
    const transaction = db.$transaction;
    const answer = (id: number, points: number | null, role = 'siswa') => ({
        siswaId: id, siswa: { id, role }, detailJawaban: {}, koreksiEssay: points === null ? null : { 1: points }
    });
    const exam = {
        id: 7, judul: 'Sumatif', ujianAsalId: null, kelasId: 2, mapelId: 3, jenisUjianId: 4, durasiMenit: 60,
        waktuSelesai: new Date(0), kkm: new Prisma.Decimal(50), poinKhusus: null,
        soal: [{ id: 1, tipeSoal: 'ESSAY', bobot: new Prisma.Decimal(100), isi: { poinEssay: 100 }, dibatalkan: false }],
        susulan: [],
        pengerjaan: [{ siswaId: 5, waktuKirim: new Date(0), diterimaOffline: new Date(0) }],
        jawaban: [answer(1, 10.55), answer(2, 50), answer(3, 90), answer(4, null), answer(5, 10), answer(6, 10, 'admin')]
    };
    let createdId: number | null = null;
    db.$transaction = (async run => run({
        $queryRaw: async () => {},
        kegiatanUjian: { findFirst: async () => null },
        ujian: {
            findFirst: async () => exam,
            findUnique: async () => createdId ? { id: createdId } : null,
            findUniqueOrThrow: async () => ({ kelasTujuan: [{ id: 2 }] }),
            create: async ({ data }: { data: Prisma.UjianUncheckedCreateInput }) => {
                assert.deepEqual(data.pesertaRemedial, { connect: [{ id: 1 }, { id: 6 }] });
                assert.equal(data.ujianAsalId, 7);
                assert.equal(data.draf, true);
                createdId = 8;
                return { id: createdId };
            }
        }
    })) as typeof transaction;
    const handler = router.stack.find(layer => layer.route?.path === '/ujian/:id/remedial')!.route.stack[0].handle;
    async function create() {
        let status = 200;
        let body: { message?: string } = {};
        const response = { locals: { user: { id: 9, role: 'admin' } }, status(code: number) { status = code; return this; }, json(data: typeof body) { body = data; } };
        await handler({ params: { id: '7' }, body: { waktuMulai: '2099-01-01T01:00:00Z', waktuSelesai: '2099-01-01T03:00:00Z' } }, response);
        return { status, message: body.message };
    }
    try {
        const pending = await create();
        assert.equal(pending.status, 409);
        assert.match(pending.message ?? '', /Tinjau 1 kiriman offline.*koreksi 1 jawaban esai/);
        exam.jawaban[3].koreksiEssay = { 1: 85 };
        exam.jawaban[4].koreksiEssay = { 1: 85 };
        exam.pengerjaan.length = 0;
        exam.waktuSelesai = new Date('2098-01-01T00:00:00Z');
        const ongoing = await create();
        assert.equal(ongoing.status, 409);
        assert.match(ongoing.message ?? '', /Sesi utama belum berakhir/);
        exam.waktuSelesai = new Date(0);
        assert.equal((await create()).status, 201);
        assert.equal((await create()).status, 200);
        assert.deepEqual(remedialAccess(1), { OR: [{ ujianAsalId: null }, { pesertaRemedial: { some: { id: 1 } } }] });
    } finally {
        db.$transaction = transaction;
        await db.$disconnect();
    }
});

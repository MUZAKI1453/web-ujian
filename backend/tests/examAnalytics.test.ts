import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { grade } from '../src/routes/examGrading';
import { collectQuestionStats, createQuestionStats, summarizeQuestionStats } from '../src/routes/questionAnalytics';

test('item statistics detect negative discrimination and omit undefined estimates', () => {
    const questions = [1, 2, 3].map(id => ({
        id, ujianId: 1, tipeSoal: 'PG', pertanyaan: '', isi: { items: [{ benar: true }, { benar: false }, { benar: false }] },
        pilihanOpsi: null, kunciJawaban: null, bobot: new Prisma.Decimal(1), dibatalkan: false, semuaBenar: false
    }));
    const stats = createQuestionStats(questions);
    let squares = 0;
    for (let index = 0; index < 10; index++) {
        const high = index < 5;
        const answers = { 1: high ? 1 : 0, 2: high ? 0 : 1, 3: high ? 0 : 1 };
        squares += collectQuestionStats(stats, answers, null, grade(questions, answers, null)) ** 2;
        if (index === 8) assert.equal(summarizeQuestionStats(stats, 9, squares).reliabilitas.kr20, null);
    }
    const summary = summarizeQuestionStats(stats, 10, squares);
    assert.equal(summary.analisisSoal[0].dayaPembeda, -1);
    assert.equal(summary.analisisSoal[0].opsi[1].korelasi, 1);
    assert.equal(summary.analisisSoal[0].opsi[2].jarangDipilih, true);
    assert.equal(summary.reliabilitas.kr20, -3);
    assert.equal(summarizeQuestionStats(createQuestionStats(questions), 10, 0).reliabilitas.kr20, null);
});

test('teacher analytics scopes the exam and separates final scores from pending submissions', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/guruRoutes')
    ]);
    const route = router.stack.find(layer => layer.route?.path === '/ujian/:id/analitik')!.route.stack[0].handle;
    const student = (id: number) => ({ id, nama: 'Siswa ' + id, username: String(id) });
    const originals = [db.guruMapelKelas.findMany, db.ujian.findFirst, db.kegiatanUjian.findMany, db.kegiatanUjian.count, db.user.findMany];
    db.guruMapelKelas.findMany = (async () => []) as typeof db.guruMapelKelas.findMany;
    db.ujian.findFirst = (async ({ where, select }) => {
        assert.deepEqual(where, { id: 7, draf: false, OR: [{ guruId: 3 }, { guru: { role: 'admin' }, OR: [] }] });
        assert.deepEqual((select?.jawaban as Prisma.Ujian$jawabanArgs).where, { siswa: { role: 'siswa' } });
        assert.deepEqual((select?.pengerjaan as Prisma.Ujian$pengerjaanArgs).where, { siswa: { role: 'siswa' } });
        return {
            soal: [
                { id: 1, tipeSoal: 'ESSAY', isi: { poinEssay: 10 }, bobot: new Prisma.Decimal(90), dibatalkan: false },
                { id: 2, tipeSoal: 'PG', isi: { items: [{ teks: 'A', benar: true }, { teks: 'B', benar: false }] }, bobot: new Prisma.Decimal(10), dibatalkan: false }
            ],
            jawaban: [
                { siswaId: 1, siswa: student(1), detailJawaban: { 1: 'Esai', 2: 0 }, koreksiEssay: { 1: 8 } },
                { siswaId: 2, siswa: student(2), detailJawaban: { 2: 1 }, koreksiEssay: null },
                { siswaId: 3, siswa: student(3), detailJawaban: { 2: 1 }, koreksiEssay: { 1: 9 } },
                { siswaId: 4, siswa: student(4), detailJawaban: {}, koreksiEssay: { 1: 0 } },
                { siswaId: 1, siswa: student(1), detailJawaban: { 2: 1 }, koreksiEssay: null }
            ],
            pengerjaan: [{ siswaId: 3, siswa: student(3), diterimaOffline: new Date() }]
        };
    }) as typeof db.ujian.findFirst;
    db.kegiatanUjian.findMany = (async ({ where }) => {
        assert.deepEqual(where, { ujianId: 7, jenis: 'pelanggaran-ujian', pelakuId: { notIn: [8] } });
        return [{ id: 1, pelakuId: 2, alasan: 'tab-hidden', waktu: new Date() }];
    }) as typeof db.kegiatanUjian.findMany;
    db.kegiatanUjian.count = (async ({ where }) => {
        assert.deepEqual(where, { ujianId: 7, jenis: 'pelanggaran-ujian', pelakuId: { notIn: [8] } });
        return 1;
    }) as typeof db.kegiatanUjian.count;
    db.user.findMany = (async ({ where }) => where?.role === 'admin' ? [{ id: 8 }] : [student(2)]) as typeof db.user.findMany;
    try {
        let status = 200;
        let body: any;
        const response = { locals: { user: { id: 3, role: 'guru' } }, status(code: number) { status = code; return this; }, json(data: unknown) { body = data; } };
        await route({ params: { id: '7' } } as unknown as Request, response as unknown as Response);
        assert.equal(status, 200);
        const byId = new Map<number, { nilai: number | null; status: string }>(body.rows.map((row: any) => [row.siswa.id, row]));
        assert.equal(byId.get(1)?.nilai, 82);
        assert.equal(byId.get(2)?.status, 'Menunggu koreksi');
        assert.equal(byId.get(2)?.nilai, null);
        assert.equal(byId.get(3)?.status, 'Menunggu tinjauan');
        assert.equal(byId.get(3)?.nilai, null);
        assert.equal(body.jumlahKiriman, 3);
        assert.equal(body.menungguTinjauan, 1);
        const [objective, essay] = body.analisisSoal;
        assert.deepEqual([objective.id, objective.nomor, essay.id, essay.nomor], [2, 1, 1, 2]);
        assert.deepEqual([essay.dikoreksi, essay.rataPoin, essay.poinMaksimum], [2, 4, 10]);
        assert.deepEqual([objective.benar, objective.salah, objective.kosong], [1, 1, 1]);
        assert.deepEqual(objective.opsi.map((option: { dipilih: number }) => option.dipilih), [1, 1]);
        assert.equal(body.totalPelanggaran, 1);
        assert.equal(body.pelanggaran[0].siswa, 'Siswa 2');
    } finally {
        [db.guruMapelKelas.findMany, db.ujian.findFirst, db.kegiatanUjian.findMany, db.kegiatanUjian.count, db.user.findMany] = originals as any;
        await db.$disconnect();
    }
});

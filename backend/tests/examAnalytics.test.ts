import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

test('teacher analytics scopes the exam and separates final scores from pending submissions', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/guruRoutes')
    ]);
    const route = router.stack.find(layer => layer.route?.path === '/ujian/:id/analitik')!.route.stack[0].handle;
    const student = (id: number) => ({ id, nama: 'Siswa ' + id, username: String(id) });
    const originals = [db.guruMapelKelas.findMany, db.ujian.findFirst, db.kegiatanUjian.findMany, db.kegiatanUjian.count, db.user.findMany];
    db.guruMapelKelas.findMany = (async () => []) as typeof db.guruMapelKelas.findMany;
    db.ujian.findFirst = (async ({ where }) => {
        assert.deepEqual(where, { id: 7, draf: false, OR: [{ guruId: 3 }, { guru: { role: 'admin' }, OR: [] }] });
        return {
            soal: [{ id: 1, tipeSoal: 'ESSAY', isi: { poinEssay: 10 }, bobot: new Prisma.Decimal(100), dibatalkan: false }],
            jawaban: [
                { siswaId: 1, siswa: student(1), koreksiEssay: { 1: 8 } },
                { siswaId: 2, siswa: student(2), koreksiEssay: null },
                { siswaId: 3, siswa: student(3), koreksiEssay: { 1: 9 } }
            ],
            pengerjaan: [{ siswaId: 3, siswa: student(3), diterimaOffline: new Date() }]
        };
    }) as typeof db.ujian.findFirst;
    db.kegiatanUjian.findMany = (async ({ where }) => {
        assert.deepEqual(where, { ujianId: 7, jenis: 'pelanggaran-ujian' });
        return [{ id: 1, pelakuId: 2, alasan: 'tab-hidden', waktu: new Date() }];
    }) as typeof db.kegiatanUjian.findMany;
    db.kegiatanUjian.count = (async () => 1) as typeof db.kegiatanUjian.count;
    db.user.findMany = (async () => [student(2)]) as typeof db.user.findMany;
    try {
        let status = 200;
        let body: any;
        const response = { locals: { user: { id: 3, role: 'guru' } }, status(code: number) { status = code; return this; }, json(data: unknown) { body = data; } };
        await route({ params: { id: '7' } } as unknown as Request, response as unknown as Response);
        assert.equal(status, 200);
        const byId = new Map<number, { nilai: number | null; status: string }>(body.rows.map((row: any) => [row.siswa.id, row]));
        assert.equal(byId.get(1)?.nilai, 80);
        assert.equal(byId.get(2)?.status, 'Menunggu koreksi');
        assert.equal(byId.get(2)?.nilai, null);
        assert.equal(byId.get(3)?.status, 'Menunggu tinjauan');
        assert.equal(byId.get(3)?.nilai, null);
        assert.equal(body.totalPelanggaran, 1);
        assert.equal(body.pelanggaran[0].siswa, 'Siswa 2');
    } finally {
        [db.guruMapelKelas.findMany, db.ujian.findFirst, db.kegiatanUjian.findMany, db.kegiatanUjian.count, db.user.findMany] = originals as any;
        await db.$disconnect();
    }
});

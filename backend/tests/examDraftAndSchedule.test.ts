import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

test('draft save preserves existing IDs, orders inserted questions and rejects stale order', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/guruRoutes')
    ]);
    const rows = [
        { id: 11, tipeSoal: 'PG', urutan: null as number | null },
        { id: 12, tipeSoal: 'PG', urutan: null as number | null },
        { id: 13, tipeSoal: 'ESSAY', urutan: null as number | null }
    ];
    const transaction = db.$transaction;
    db.$transaction = (async run => run({
        $queryRaw: async () => {},
        jenisUjian: { findUnique: async () => ({ nama: 'Sumatif' }) },
        ujian: {
            findFirst: async () => ({ draf: true, ujianAsalId: null, soal: rows }),
            update: async () => ({ soal: rows })
        },
        soal: {
            update: async ({ where, data }: { where: { id: number }; data: { urutan: number } }) => {
                Object.assign(rows.find(row => row.id === where.id)!, data);
            },
            createMany: async ({ data }: { data: { tipeSoal: string; urutan: number }[] }) => {
                rows.push(...data.map((row, index) => ({ ...row, id: 14 + index })));
            }
        }
    })) as typeof transaction;

    async function save(soalAwal: number[], urutanSoal: (number | null)[], perubahan: object[] = []) {
        const handler = router.stack.find(layer => layer.route?.path === '/ujian/:id/draf')!.route.stack[0].handle;
        let status = 200;
        let data: { soal?: { id: number }[] } = {};
        const res = { locals: { user: { id: 3, role: 'admin' } },
            status(code: number) { status = code; return this; }, json(body: typeof data) { data = body; } };
        await handler({ params: { id: '7' }, body: {
            soalAwal, urutanSoal, perubahan, hapus: [], jenisUjianId: 5, durasiMenit: 60,
            waktuMulai: '2099-05-01T01:00:00.000Z', waktuSelesai: '2099-05-01T03:00:00.000Z'
        } }, res);
        return { status, ids: data.soal?.map(row => row.id) };
    }

    try {
        assert.equal((await save([11, 12, 13], [12, 12, 13])).status, 400);
        const addition = { id: null, soal: {
            tipeSoal: 'PG', pertanyaan: 'Soal baru', items: [{ teks: 'Benar', benar: true }, { teks: 'Salah', benar: false }]
        } };
        assert.deepEqual(await save([11, 12, 13], [12, null, 11, 13], [addition]), { status: 200, ids: [12, 14, 11, 13] });
        assert.equal((await save([11, 12, 14, 13], [11, 12, 14, 13])).status, 409);
    } finally {
        db.$transaction = transaction;
    }
});

test('teacher can duplicate an authorized exam and reschedule only before anyone starts', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/guruRoutes')
    ]);
    const originals = { findPairs: db.guruMapelKelas.findMany, findType: db.jenisUjian.findUnique, transaction: db.$transaction };
    db.guruMapelKelas.findMany = (async () => [{ mapelId: 2, kelasId: 4, mapel: { id: 2 }, kelas: { id: 4 } }]) as typeof originals.findPairs;
    db.jenisUjian.findUnique = (async () => ({ id: 5, nama: 'Sumatif' })) as typeof originals.findType;
    const question = { tipeSoal: 'ESSAY', pertanyaan: 'Jelaskan.', isi: { poinEssay: 8 }, pilihanOpsi: null, kunciJawaban: null, bobot: 100 };
    const scope = { id: 7, OR: [{ guruId: 3 }, { guru: { role: 'admin' }, OR: [{ mapelId: 2, kelasId: { in: [4] }, kelasTujuan: { every: { id: { in: [4] } } } }] }] };
    const schedule = { waktuMulai: '2099-05-01T01:00:00.000Z', waktuSelesai: '2099-05-01T03:00:00.000Z' };
    const stored = { durasiMenit: 60, diarsipkanPada: null as Date | null, waktuMulai: new Date(0), waktuSelesai: new Date(1),
        _count: { pengerjaan: 0, jawaban: 0, kegiatan: 0 } };
    let sourceAccessible = true;
    let locked = false;
    let writes = 0;
    let explicitRules = false;
    db.$transaction = (async run => {
        locked = false;
        return run({
            $queryRaw: async () => { locked = true; },
            ujian: {
                findFirst: async ({ where, select }: { where: Prisma.UjianWhereInput; select: Prisma.UjianSelect }) => {
                    assert.ok(locked);
                    if (where.draf === false) {
                        assert.deepEqual(where, { ...scope, draf: false });
                        assert.deepEqual(select._count, { select: { pengerjaan: true, jawaban: true, kegiatan: { where: { jenis: 'reset-pengerjaan' } } } });
                        return stored;
                    }
                    assert.deepEqual(where, { ...scope, mapelId: 2 });
                    assert.deepEqual(select.soal, { where: { dibatalkan: false }, orderBy: { id: 'asc' } });
                    return sourceAccessible ? { draf: false, poinKhusus: {}, soal: [question] } : null;
                },
                create: async ({ data }: { data: Prisma.UjianUncheckedCreateInput }) => {
                    assert.equal(data.guruId, 3);
                    assert.equal(data.draf, true);
                    assert.equal(data.hasilRilis, false);
                    assert.equal(data.profil, explicitRules ? 'latihan-kuis' : undefined);
                    assert.equal(data.tujuanRekap, undefined);
                    assert.equal(data.bahasanRilis, explicitRules ? true : undefined);
                    assert.equal(data.token, undefined);
                    assert.equal(data.jawaban, undefined);
                    assert.equal(data.pengerjaan, undefined);
                    assert.equal(data.diarsipkanPada, undefined);
                    assert.deepEqual(data.kelasTujuan, { connect: [{ id: 4 }] });
                    assert.deepEqual(data.poinKhusus, {});
                    assert.equal((data.soal?.create as { bobot: number }[])[0].bobot, 8);
                    assert.deepEqual((data.soal?.create as { isi: unknown }[])[0].isi, question.isi);
                    return { id: 9 };
                },
                update: async ({ data }: { data: Prisma.UjianUpdateInput }) => {
                    assert.deepEqual(data, { waktuMulai: new Date(schedule.waktuMulai), waktuSelesai: new Date(schedule.waktuSelesai) });
                    writes++;
                }
            },
            kegiatanUjian: { create: async ({ data }: { data: Prisma.KegiatanUjianUncheckedCreateInput }) => {
                assert.equal(data.jenis, 'ubah-jadwal');
                assert.equal(data.pelakuId, 3);
            } }
        });
    }) as typeof originals.transaction;

    async function call(path: string, body: object) {
        const handler = router.stack.find(layer => layer.route?.path === '/ujian/:id/' + path)!.route.stack[0].handle;
        let status = 200;
        const response = { locals: { user: { id: 3, role: 'guru' } }, status(code: number) { status = code; return this; }, json() {} };
        await handler({ params: { id: '7' }, body }, response);
        return status;
    }

    try {
        const copy = { ...schedule, kelasIds: [4], mapelId: 2, jenisUjianId: 5, durasiMenit: 60 };
        assert.equal(await call('duplikat', { ...copy, kelasIds: [99] }), 403);
        assert.equal(await call('duplikat', copy), 201);
        const aturanDraf = { token: 'tanpa', hasilOtomatis: false, pembahasanOtomatis: true };
        explicitRules = true;
        assert.equal(await call('duplikat', { ...copy, aturanDraf }), 201);
        assert.equal(await call('duplikat', { ...copy, aturanDraf: { ...aturanDraf, token: 'bebas' } }), 400);
        explicitRules = false;
        sourceAccessible = false;
        assert.equal(await call('duplikat', copy), 404);
        assert.equal(await call('jadwal', { ...schedule, waktuSelesai: '2099-05-01T01:30:00.000Z', durasiMenit: 1 }), 400);
        stored._count.pengerjaan = 1;
        assert.equal(await call('jadwal', schedule), 409);
        stored._count.pengerjaan = 0;
        stored._count.kegiatan = 1;
        assert.equal(await call('jadwal', schedule), 409);
        stored._count.kegiatan = 0;
        stored.diarsipkanPada = new Date();
        assert.equal(await call('jadwal', schedule), 409);
        stored.diarsipkanPada = null;
        assert.equal(writes, 0);
        assert.equal(await call('jadwal', schedule), 200);
        assert.equal(writes, 1);
    } finally {
        db.guruMapelKelas.findMany = originals.findPairs;
        db.jenisUjian.findUnique = originals.findType;
        db.$transaction = originals.transaction;
        await db.$disconnect();
    }
});

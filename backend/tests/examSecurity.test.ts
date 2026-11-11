import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import dotenv from 'dotenv';
import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { defaultSecurityWeights, parseCancelReason, parseSecurityConfig, parseSecurityEvents, parseSecurityWeights, recordSecurity, violationCancellation } from '../src/routes/examSecurity';

test('security reports reject invalid data and collapse retries of the same event', () => {
    const event = { id: 'event-123456', reason: 'tab-hidden' };
    assert.deepEqual(parseSecurityEvents([event, event]), [event]);
    assert.deepEqual(parseSecurityEvents(undefined), []);
    for (const input of [null, {}, [null], [{ ...event, reason: 'unknown' }], [{ ...event, id: 'bad' }], Array(17).fill(event)]) {
        assert.equal(parseSecurityEvents(input), null);
    }
});

test('disabled events are acknowledged and passive events add risk without incrementing the interruption count', async () => {
    const weights = { ...defaultSecurityWeights, 'tab-hidden': 0, copy: 4 };
    assert.deepEqual(parseSecurityWeights(weights), weights);
    assert.equal(parseSecurityWeights({ ...weights, copy: 11 }), null);
    const rows: { alasan: string; data: unknown; waktu: Date }[] = [];
    const tx = { kegiatanUjian: {
        findMany: async () => rows,
        create: async ({ data }: { data: { alasan: string; data: unknown } }) => rows.push({ ...data, waktu: new Date() })
    } } as unknown as Prisma.TransactionClient;
    const events = [
        { id: 'event-tab', reason: 'tab-hidden' },
        { id: 'event-copy', reason: 'copy' },
        { id: 'event-focus', reason: 'window-blur' }
    ] as const;
    const result = await recordSecurity(tx, 1, 2, 3, [...events], weights);
    assert.equal(result.securityCount, 1);
    assert.deepEqual(result.securityAck, events.map(event => event.id));
    assert.deepEqual(rows.map(row => [row.alasan, (row.data as { weight: number }).weight]), [['copy', 4], ['window-blur', 2]]);
    assert.equal((await recordSecurity(tx, 1, 2, 3, [...events], weights)).securityCount, 1);
    assert.equal(rows.length, 2);
});

test('violation limit is stored with the weights; old settings without a limit keep three', () => {
    assert.deepEqual(parseSecurityConfig(defaultSecurityWeights), { weights: defaultSecurityWeights, limit: 3 });
    assert.deepEqual(parseSecurityConfig({ ...defaultSecurityWeights, batas: 0 }), { weights: defaultSecurityWeights, limit: 0 });
    assert.deepEqual(parseSecurityConfig({ ...defaultSecurityWeights, batas: 5 }), { weights: defaultSecurityWeights, limit: 5 });
    for (const input of [undefined, {}, { ...defaultSecurityWeights, batas: 11 }, { ...defaultSecurityWeights, batas: -1 },
        { ...defaultSecurityWeights, batas: 2.5 }, { ...defaultSecurityWeights, batas: '3' }, { ...defaultSecurityWeights, lain: 1 }]) {
        assert.equal(parseSecurityConfig(input), null);
    }
});

test('interruptions are counted up to the exam limit; limit 0 keeps counting without a submit threshold', async () => {
    const store = () => {
        const rows: { alasan: string; data: unknown; waktu: Date }[] = [];
        return { rows, tx: { kegiatanUjian: {
            findMany: async () => rows,
            create: async ({ data }: { data: { alasan: string; data: unknown } }) => rows.push({ ...data, waktu: new Date() })
        } } as unknown as Prisma.TransactionClient };
    };
    const events = Array.from({ length: 7 }, (_, index) => ({ id: 'event-limit-' + index, reason: 'tab-hidden' as const }));
    const limited = store();
    assert.equal((await recordSecurity(limited.tx, 1, 2, 3, events, defaultSecurityWeights, 5)).securityCount, 5);
    assert.equal(limited.rows.length, 5);
    const standard = store();
    assert.equal((await recordSecurity(standard.tx, 1, 2, 3, events)).securityCount, 3);
    const unlimited = store();
    assert.equal((await recordSecurity(unlimited.tx, 1, 2, 3, events, defaultSecurityWeights, 0)).securityCount, 7);
    assert.equal(unlimited.rows.length, 7);
});

test('a violation cancelled by the teacher stops counting but its retry is not recorded again', async () => {
    assert.equal(parseCancelReason('  telepon   masuk  '), 'telepon masuk');
    for (const input of [undefined, 12, 'ya', ' a  b ', 'x'.repeat(301)]) assert.equal(parseCancelReason(input), null);
    assert.equal(violationCancellation({ eventId: 'a' }), null);
    assert.deepEqual(violationCancellation({ dibatalkan: { oleh: 1, alasan: 'telepon masuk', waktu: '2026-11-11T00:00:00.000Z' } }),
        { alasan: 'telepon masuk', waktu: '2026-11-11T00:00:00.000Z' });
    const rows: { alasan: string; data: Record<string, unknown>; waktu: Date }[] = [];
    const tx = { kegiatanUjian: {
        findMany: async () => rows,
        create: async ({ data }: { data: { alasan: string; data: Record<string, unknown> } }) => rows.push({ ...data, waktu: new Date() })
    } } as unknown as Prisma.TransactionClient;
    const events = [{ id: 'event-cancel-1', reason: 'tab-hidden' as const }, { id: 'event-cancel-2', reason: 'window-blur' as const }];
    assert.equal((await recordSecurity(tx, 1, 2, 3, events)).securityCount, 2);
    rows[0].data = { ...rows[0].data, dibatalkan: { oleh: 9, alasan: 'telepon masuk', waktu: new Date().toISOString() } };
    assert.equal((await recordSecurity(tx, 1, 2, 3, events)).securityCount, 1);
    assert.equal(rows.length, 2);
    // Setelah satu dibatalkan, pelanggaran baru masih bisa dicatat sampai batas ujian tercapai lagi.
    const more = [{ id: 'event-cancel-3', reason: 'fullscreen-exit' as const }, { id: 'event-cancel-4', reason: 'split-screen' as const }, { id: 'event-cancel-5', reason: 'tab-hidden' as const }];
    assert.equal((await recordSecurity(tx, 1, 2, 3, more)).securityCount, 3);
    assert.equal(rows.length, 4);
});

test('optional token activation invalidates earlier preparation without bypassing the schedule', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/studentExamRoutes')
    ]);
    const exam = { profil: 'ulangan-harian', token: null as string | null, masukBuka: true,
        waktuMulai: new Date(Date.now() - 60_000), waktuSelesai: new Date(Date.now() + 60_000),
        susulan: [], pengerjaan: [], jawaban: [] };
    const transaction = db.$transaction;
    db.$transaction = (async run => run({
        $queryRaw: async () => [], user: { findFirst: async () => ({ kelasId: 1 }) },
        ujian: { findFirst: async () => exam }, percobaanToken: { findUnique: async () => null }
    })) as typeof transaction;
    const handler = router.stack.find(layer => layer.route?.path === '/ujian/:id/:langkah(siapkan|mulai)')!.route.stack[0].handle;
    async function request(langkah: string, body: unknown = {}) {
        let status = 200;
        let data: { izin?: string } = {};
        await handler({ params: { id: '1', langkah }, body }, {
            locals: { user: { id: 1, role: 'siswa', sesiLogin: 'test-session' } },
            status(code: number) { status = code; return this; }, json(response: typeof data) { data = response; }
        });
        return { status, data };
    }
    try {
        const prepared = await request('siapkan');
        assert.equal(prepared.status, 200);
        assert.ok(prepared.data.izin);
        exam.token = 'ABC123';
        assert.equal((await request('mulai', { izin: prepared.data.izin })).status, 409);
        assert.equal((await request('siapkan')).status, 400);
        exam.profil = 'latihan-kuis';
        assert.equal((await request('siapkan')).status, 200);
        exam.masukBuka = false;
        assert.equal((await request('siapkan')).status, 409);
        exam.masukBuka = true;
        exam.profil = 'standar';
        exam.token = null;
        assert.equal((await request('siapkan')).status, 409);
    } finally {
        db.$transaction = transaction;
        await db.$disconnect();
    }
});

test('API: no questions before the timer; retries and reload retain count; third violation submits and locks answers', {
    skip: process.env.RUN_DATABASE_TESTS !== '1'
}, async () => {
    dotenv.config({ quiet: true });
    const [{ default: express }, { default: jwt }, { default: router }, { default: db }, { jwtSecret }] = await Promise.all([
        import('express'), import('jsonwebtoken'), import('../src/routes/studentExamRoutes'), import('../src/config/db'), import('../src/middleware/auth')
    ]);
    const prefix = 'security-test-' + randomUUID();
    let fixture: { studentId: number; classId: number; subjectId: number; examId: number; questionId: number; session: string } | undefined;
    const app = express(); app.use(express.json()); app.use('/api/siswa', router);
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        fixture = await db.$transaction(async tx => {
            const klass = await tx.kelas.create({ data: { namaKelas: prefix } });
            const subject = await tx.mapel.create({ data: { nama: prefix } });
            const session = randomUUID();
            const student = await tx.user.create({ data: { username: randomUUID(), password: 'unused-test-account', role: 'siswa', sesiLogin: session, kelasId: klass.id } });
            const exam = await tx.ujian.create({ data: {
                judul: prefix, kelasId: klass.id, mapelId: subject.id, draf: false, token: 'ABC123', masukBuka: true,
                waktuMulai: new Date(Date.now() - 60000), waktuSelesai: new Date(Date.now() + 3600000), durasiMenit: 30,
                soal: { create: { tipeSoal: 'PG', pertanyaan: '1 + 1?', bobot: 100, isi: { items: [{ teks: '2', benar: true }, { teks: '3', benar: false }] } } }
            }, include: { soal: true } });
            return { studentId: student.id, classId: klass.id, subjectId: subject.id, examId: exam.id, questionId: exam.soal[0].id, session };
        });
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const base = `http://127.0.0.1:${address.port}/api/siswa/ujian/${fixture.examId}`;
        const auth = jwt.sign({ id: fixture.studentId, sesiLogin: fixture.session }, jwtSecret, { expiresIn: '5m' });
        const request = async (path: string, method: string, body: unknown) => {
            const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            return { status: response.status, data: await response.json() as Record<string, any> };
        };
        const prepare = await request('/siapkan', 'POST', { token: 'ABC123' });
        assert.equal(prepare.status, 200);
        assert.equal('soal' in prepare.data, false);
        const permission = jwt.decode(prepare.data.izin);
        assert.ok(permission && typeof permission === 'object');
        assert.equal('gate' in permission, false);
        assert.equal(Object.values(permission).includes('ABC123'), false);
        assert.equal(await db.pengerjaanUjian.count({ where: { ujianId: fixture.examId } }), 0);
        const start = await request('/mulai', 'POST', { izin: prepare.data.izin });
        assert.equal(start.status, 200);
        assert.equal(start.data.securityCount, 0);
        assert.equal('benar' in start.data.soal[0].items[0], false);
        // Opsi diacak per pengerjaan: siswa memilih posisi tampil opsi "2"; server harus menyimpannya sebagai indeks asli 0.
        const shown = start.data.soal[0].items.map((item: { teks: string }) => item.teks);
        assert.deepEqual([...shown].sort(), ['2', '3']);
        const payload = { attemptId: start.data.attemptId, versi: 1, jawaban: { [fixture.questionId]: shown.indexOf('2') }, kirim: false };
        const first = { id: randomUUID(), reason: 'tab-hidden' };
        const save = await request('/jawaban', 'PUT', { ...payload, securityEvents: [first] });
        assert.equal(save.status, 200); assert.equal(save.data.securityCount, 1);
        const retry = await request('/jawaban', 'PUT', { ...payload, securityEvents: [first] });
        assert.equal(retry.data.securityCount, 1);
        const resume = await request('/mulai', 'POST', {});
        assert.equal(resume.data.securityCount, 1);
        assert.deepEqual(resume.data.soal[0].items.map((item: { teks: string }) => item.teks), shown);
        assert.deepEqual(resume.data.jawaban, payload.jawaban);
        const second = await request('/jawaban', 'PUT', { ...payload, versi: 2, securityEvents: [{ id: randomUUID(), reason: 'fullscreen-exit' }] });
        assert.equal(second.data.securityCount, 2); assert.equal(second.data.state, 'saved');
        const third = await request('/jawaban', 'PUT', { ...payload, versi: 3, securityEvents: [{ id: randomUUID(), reason: 'window-blur' }] });
        assert.equal(third.data.securityCount, 3); assert.equal(third.data.state, 'submitted');
        assert.match(third.data.message, /setelah 3 pelanggaran/);
        assert.equal(third.data.receipt.answered, 1);
        assert.equal(third.data.receipt.id, `UJ-${fixture.examId}-${fixture.studentId}-${start.data.attemptId}`);
        const change = await request('/jawaban', 'PUT', { ...payload, versi: 4, jawaban: { [fixture.questionId]: shown.indexOf('3') } });
        assert.equal(change.data.state, 'submitted');
        const answer = await db.jawabanSiswa.findFirstOrThrow({ where: { ujianId: fixture.examId, siswaId: fixture.studentId } });
        assert.equal(Number(answer.totalNilai), 100);
        assert.deepEqual(answer.detailJawaban, { [fixture.questionId]: 0 });
        assert.equal(await db.jawabanSiswa.count({ where: { ujianId: fixture.examId } }), 1);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (fixture) {
            const ids = fixture;
            await db.$transaction(async tx => {
                await tx.ujian.delete({ where: { id: ids.examId } });
                await tx.user.delete({ where: { id: ids.studentId } });
                await tx.kelas.delete({ where: { id: ids.classId } });
                await tx.mapel.delete({ where: { id: ids.subjectId } });
            });
        }
        await db.$disconnect();
    }
});

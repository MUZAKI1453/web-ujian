import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import dotenv from 'dotenv';
import { parseSecurityEvents } from '../src/routes/examSecurity';

test('security reports reject invalid data and collapse retries of the same event', () => {
    const event = { id: 'event-123456', reason: 'tab-hidden' };
    assert.deepEqual(parseSecurityEvents([event, event]), [event]);
    assert.deepEqual(parseSecurityEvents(undefined), []);
    for (const input of [null, {}, [null], [{ ...event, reason: 'unknown' }], [{ ...event, id: 'bad' }], [event, event, event, event]]) {
        assert.equal(parseSecurityEvents(input), null);
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
        assert.equal(await db.pengerjaanUjian.count({ where: { ujianId: fixture.examId } }), 0);
        const start = await request('/mulai', 'POST', { izin: prepare.data.izin });
        assert.equal(start.status, 200);
        assert.equal(start.data.securityCount, 0);
        assert.equal('benar' in start.data.soal[0].items[0], false);
        const payload = { attemptId: start.data.attemptId, versi: 1, jawaban: { [fixture.questionId]: 0 }, kirim: false };
        const first = { id: randomUUID(), reason: 'tab-hidden' };
        const save = await request('/jawaban', 'PUT', { ...payload, securityEvents: [first] });
        assert.equal(save.status, 200); assert.equal(save.data.securityCount, 1);
        const retry = await request('/jawaban', 'PUT', { ...payload, securityEvents: [first] });
        assert.equal(retry.data.securityCount, 1);
        const resume = await request('/mulai', 'POST', {});
        assert.equal(resume.data.securityCount, 1);
        const second = await request('/jawaban', 'PUT', { ...payload, versi: 2, securityEvents: [{ id: randomUUID(), reason: 'fullscreen-exit' }] });
        assert.equal(second.data.securityCount, 2); assert.equal(second.data.state, 'saved');
        const third = await request('/jawaban', 'PUT', { ...payload, versi: 3, securityEvents: [{ id: randomUUID(), reason: 'window-blur' }] });
        assert.equal(third.data.securityCount, 3); assert.equal(third.data.state, 'submitted');
        assert.match(third.data.message, /tiga pelanggaran/);
        const change = await request('/jawaban', 'PUT', { ...payload, versi: 4, jawaban: { [fixture.questionId]: 1 } });
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

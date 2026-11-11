import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma, PrismaClient } from '@prisma/client';
import { answerSummary } from '../src/routes/answerSummary';
import { answerState } from '../../frontend/src/pages/siswa/answerStatus';
import { isStudentHistory, prioritizeStudentExams } from '../../frontend/src/pages/siswa/studentSections';

test('student views retain expired attempts for synchronization and separate completed exams', () => {
    const scheduled = { id: 1, status: 'Terjadwal', mulai: '2026-11-06T07:00:00Z', submitted: false, offline: false, attempt: null };
    const active = { ...scheduled, id: 2, status: 'Berlangsung' };
    const waiting = { ...scheduled, id: 3, status: 'Selesai', attempt: 17 };
    const submitted = { ...active, id: 4, submitted: true, attempt: 18 };
    const review = { ...active, id: 5, offline: true, attempt: 19 };
    const missed = { ...scheduled, id: 6, status: 'Selesai' };
    const exams = [scheduled, submitted, active, waiting, review, missed];
    const pending = exams.filter(exam => !isStudentHistory(exam));
    assert.deepEqual(prioritizeStudentExams(pending).map(exam => exam.id), [3, 2, 1]);
    assert.deepEqual(exams.filter(isStudentHistory).map(exam => exam.id), [4, 5, 6]);
    assert.deepEqual(exams.map(exam => exam.id), [1, 4, 2, 3, 5, 6]);
});

test('student progress and receipt count whitespace, false, option zero, and incomplete true/false correctly', () => {
    const questions = [
        { id: 1, tipeSoal: 'PG', isi: { items: [{}, {}] } },
        { id: 2, tipeSoal: 'ESSAY', isi: {} },
        { id: 3, tipeSoal: 'BS', isi: { items: [{}, {}] } },
        { id: 4, tipeSoal: 'BS', isi: { items: [{}, {}] } },
        { id: 5, tipeSoal: 'PM', isi: { items: [{}, {}] } }
    ];
    const answers = { 1: 0, 2: ' \n ', 3: [false, true], 4: [false, null], 5: [] };
    assert.deepEqual(answerSummary(questions, answers), { total: 5, answered: 2, partial: 1, missing: 2 });
    const frontend = questions.map(q => answerState({ tipeSoal: q.tipeSoal, items: 'items' in q.isi ? q.isi.items as { teks: string }[] : [] }, answers[q.id as keyof typeof answers]));
    assert.deepEqual(frontend, ['Terjawab', 'Kosong', 'Terjawab', 'Belum lengkap', 'Kosong']);
});

test('student API protects receipts and respects separate result/discussion release settings', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { jwtSecret }, { default: results }, { default: exams }] = await Promise.all([
        import('../src/config/db'), import('../src/middleware/auth'), import('../src/routes/studentResultsRoutes'), import('../src/routes/studentExamRoutes')
    ]);
    const originals = [db.user.findUnique, db.ujian.findFirst, db.pengerjaanUjian.count, db.user.findUniqueOrThrow, db.ujian.findMany];
    const question = { id: 31, tipeSoal: 'ESSAY', pertanyaan: 'Jelaskan', isi: { pedoman: 'Pedoman guru' }, bobot: new Prisma.Decimal(10), dibatalkan: false, semuaBenar: false };
    const answer = { id: 81, siswaId: 9, waktuSubmit: new Date('2026-11-05T07:30:00Z'), totalNilai: new Prisma.Decimal(7), detailJawaban: { 31: 'Jawaban siswa' }, koreksiEssay: { 31: 7, catatan: { 31: 'Tambahkan contoh.' } } };
    const attempt = { id: 91, waktuKirim: answer.waktuSubmit, diterimaOffline: null as Date | null, kirimanOffline: { 31: 'Kiriman tertunda' } };
    const exam = { id: 17, judul: 'PTS', mapel: { nama: 'IPA' }, hasilRilis: false, bahasanRilis: false,
        soal: [{ ...question, id: 30, tipeSoal: 'PG', dibatalkan: true }, question], jawaban: [answer], pengerjaan: [attempt] };
    let lastSessionEnd = 0;
    let role = 'siswa';
    db.user.findUnique = (async () => ({ id: 9, role, sesiLogin: 'student-session' })) as any;
    db.ujian.findFirst = (async (args: any) => {
        assert.equal(args.where.draf, false);
        assert.equal(args.include.jawaban.where.siswaId, 9);
        if (args.where.susulan && lastSessionEnd > +args.where.susulan.none.waktuSelesai.gt) return null;
        return args.where.id === 17 ? exam : null;
    }) as any;
    db.pengerjaanUjian.count = (async () => attempt.diterimaOffline ? 1 : 0) as any;
    db.user.findUniqueOrThrow = (async () => ({ kelasId: 1 })) as any;
    db.ujian.findMany = (async (args: any) => {
        assert.equal(args.include.jawaban.where.siswaId, 9);
        if (role === 'admin') {
            assert.equal(args.where.draf, false);
            assert.deepEqual(args.where.OR.slice(0, 4), [
                { pesertaRemedial: { some: { id: 9 } } },
                { susulan: { some: { peserta: { some: { siswaId: 9 } } } } },
                { pengerjaan: { some: { siswaId: 9 } } },
                { jawaban: { some: { siswaId: 9 } } }
            ]);
        }
        assert.deepEqual(args.include.soal.where, { tipeSoal: 'ESSAY', dibatalkan: false });
        return [{ ...exam, soal: [question], susulan: [], waktuMulai: new Date('2026-11-05T07:00:00Z'), waktuSelesai: new Date('2026-11-05T08:00:00Z') }];
    }) as any;
    const app = express();
    app.use('/api/siswa', exams);
    app.use('/api/siswa', results);
    try {
        const token = jwt.sign({ id: 9, sesiLogin: 'student-session' }, jwtSecret);
        // Dispatch real Express middleware in process; no database or TCP connection is required.
        const get = (path: string, authenticated = true): Promise<{ status: number; data: any }> => new Promise((resolve, reject) => {
            const request = new IncomingMessage(new Socket());
            request.method = 'GET';
            request.url = '/api/siswa/ujian/' + path;
            request.headers = authenticated ? { authorization: 'Bearer ' + token } : {};
            const response = new ServerResponse(request);
            response.end = ((chunk: unknown) => {
                try { resolve({ status: response.statusCode, data: JSON.parse(String(chunk)) }); }
                catch (error) { reject(error); }
                return response;
            }) as any;
            app(request, response);
        });
        assert.equal((await get('17/bukti', false)).status, 401);
        assert.equal((await get('18/bukti')).status, 404);
        const receipt = await get('17/bukti');
        assert.equal(receipt.status, 200);
        assert.equal(receipt.data.mapel, 'IPA');
        assert.equal(receipt.data.title, 'PTS');
        assert.equal(receipt.data.receivedAt, answer.waktuSubmit.toISOString());
        assert.equal(receipt.data.answered, 1);
        assert.equal(receipt.data.state, 'submitted');
        assert.equal('detailJawaban' in receipt.data, false);
        assert.equal((await get('17/pembahasan')).status, 404);
        assert.equal((await get('17/hasil')).status, 404);
        assert.equal((await get('')).data.data[0].nilai, null);
        exam.bahasanRilis = true;
        lastSessionEnd = Date.now() + 60_000;
        assert.equal((await get('17/pembahasan')).status, 404);
        lastSessionEnd = 0;
        const discussion = await get('17/pembahasan');
        assert.deepEqual(discussion.data.soal.map((item: { nomor: number }) => item.nomor), [2]);
        assert.equal((await get('')).data.data[0].nilai, null);
        assert.equal(discussion.data.soal[0].jawabanSiswa, 'Jawaban siswa');
        assert.equal('pedoman' in discussion.data.soal[0].isi, false);
        assert.equal(discussion.data.soal[0].penilaian, null);
        assert.equal(discussion.data.soal[0].catatan, null);
        exam.hasilRilis = true;
        const released = await get('17/pembahasan');
        assert.equal(released.data.soal[0].penilaian.poin, '7.0000');
        assert.equal(released.data.soal[0].catatan, 'Tambahkan contoh.');
        assert.equal((await get('17/hasil')).data.nilai, '7.00');
        assert.equal((await get('')).data.data[0].nilai, '7.00');
        Reflect.deleteProperty(answer.koreksiEssay, '31');
        assert.equal((await get('')).data.data[0].nilai, null);
        answer.koreksiEssay[31] = 7;
        attempt.diterimaOffline = new Date();
        const offline = await get('17/bukti');
        assert.equal(offline.data.state, 'review');
        assert.equal(offline.data.receivedAt, attempt.diterimaOffline.toISOString());
        assert.equal((await get('17/hasil')).status, 404);
        assert.equal((await get('')).data.data[0].nilai, null);
        const pendingDiscussion = await get('17/pembahasan');
        assert.equal(pendingDiscussion.data.soal[0].penilaian, null);
        assert.equal(pendingDiscussion.data.soal[0].catatan, null);
        role = 'admin';
        attempt.diterimaOffline = null;
        assert.equal((await get('')).data.data[0].nilai, '7.00');
        assert.equal((await get('17/bukti')).status, 200);
    } finally {
        [db.user.findUnique, db.ujian.findFirst, db.pengerjaanUjian.count, db.user.findUniqueOrThrow, db.ujian.findMany] = originals as any;
        t.mock.restoreAll();
    }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma, PrismaClient } from '@prisma/client';
import { answerSummary } from '../src/routes/answerSummary';
import { answerState } from '../../frontend/src/pages/siswa/answerStatus';

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
    const [{ default: db }, { jwtSecret }, { default: results }] = await Promise.all([
        import('../src/config/db'), import('../src/middleware/auth'), import('../src/routes/studentResultsRoutes')
    ]);
    const originals = [db.user.findUnique, db.ujian.findFirst, db.pengerjaanUjian.count];
    const question = { id: 31, tipeSoal: 'ESSAY', pertanyaan: 'Jelaskan', isi: { pedoman: 'Pedoman guru' }, bobot: new Prisma.Decimal(10), dibatalkan: false, semuaBenar: false };
    const answer = { id: 81, siswaId: 9, waktuSubmit: new Date('2026-11-05T07:30:00Z'), detailJawaban: { 31: 'Jawaban siswa' }, koreksiEssay: { 31: 7, catatan: { 31: 'Tambahkan contoh.' } } };
    const attempt = { id: 91, waktuKirim: answer.waktuSubmit, diterimaOffline: null as Date | null, kirimanOffline: { 31: 'Kiriman tertunda' } };
    const exam = { id: 17, judul: 'Ujian IPA', hasilRilis: false, bahasanRilis: false, soal: [question], jawaban: [answer], pengerjaan: [attempt] };
    db.user.findUnique = (async () => ({ id: 9, role: 'siswa', sesiLogin: 'student-session' })) as any;
    db.ujian.findFirst = (async (args: any) => {
        assert.equal(args.where.draf, false);
        assert.equal(args.include.jawaban.where.siswaId, 9);
        return args.where.id === 17 ? exam : null;
    }) as any;
    db.pengerjaanUjian.count = (async () => attempt.diterimaOffline ? 1 : 0) as any;
    const app = express();
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
        assert.equal(receipt.data.receivedAt, answer.waktuSubmit.toISOString());
        assert.equal(receipt.data.answered, 1);
        assert.equal(receipt.data.state, 'submitted');
        assert.equal('detailJawaban' in receipt.data, false);
        assert.equal((await get('17/pembahasan')).status, 404);
        assert.equal((await get('17/hasil')).status, 404);
        exam.bahasanRilis = true;
        const discussion = await get('17/pembahasan');
        assert.equal(discussion.data.soal[0].jawabanSiswa, 'Jawaban siswa');
        assert.equal(discussion.data.soal[0].penilaian, null);
        assert.equal(discussion.data.soal[0].catatan, null);
        exam.hasilRilis = true;
        const released = await get('17/pembahasan');
        assert.equal(released.data.soal[0].penilaian.poin, '7.0000');
        assert.equal(released.data.soal[0].catatan, 'Tambahkan contoh.');
        assert.equal((await get('17/hasil')).data.nilai, '7.00');
        attempt.diterimaOffline = new Date();
        const offline = await get('17/bukti');
        assert.equal(offline.data.state, 'review');
        assert.equal(offline.data.receivedAt, attempt.diterimaOffline.toISOString());
        assert.equal((await get('17/hasil')).status, 404);
        const pendingDiscussion = await get('17/pembahasan');
        assert.equal(pendingDiscussion.data.soal[0].penilaian, null);
        assert.equal(pendingDiscussion.data.soal[0].catatan, null);
    } finally {
        [db.user.findUnique, db.ujian.findFirst, db.pengerjaanUjian.count] = originals as any;
        t.mock.restoreAll();
    }
});

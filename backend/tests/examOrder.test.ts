import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answersToDisplay, answersToOriginal, makeExamOrder, orderItems, orderQuestions, parseExamOrder } from '../src/routes/examOrder';
import { grade, revise } from '../src/routes/examGrading';
import { sortQuestions } from '../src/routes/questionOrder';
import { answerSummary } from '../src/routes/answerSummary';
import { answerState } from '../../frontend/src/pages/siswa/answerStatus';
import { Prisma } from '@prisma/client';

const items = (keys: boolean[]) => ({ items: keys.map((benar, index) => ({ teks: 'opsi ' + index, benar })) });
const questions = [
    { id: 11, tipeSoal: 'PG', isi: items([false, true, false, false]) },
    { id: 12, tipeSoal: 'PG', isi: items([true, false, false, false]) },
    { id: 13, tipeSoal: 'PM', isi: items([true, false, true, false]) },
    { id: 14, tipeSoal: 'BS', isi: items([true, false]) },
    { id: 15, tipeSoal: 'PG', isi: items([false, false, true, false]) },
    { id: 16, tipeSoal: 'ESSAY', isi: { pedoman: '' } },
    { id: 17, tipeSoal: 'ISIAN', isi: { jawaban: ['x'] } }
];
// Selalu mengambil indeks terakhir: Fisher–Yates menjadi tanpa perubahan; indeks 0 memutar urutan.
const rotate = () => 0;

test('pengacakan dimatikan menghasilkan urutan kosong', () => {
    assert.equal(makeExamOrder(questions, false, false), null);
    assert.deepEqual(orderQuestions(questions, null), questions);
    assert.deepEqual(answersToOriginal({ 11: 2 }, null), { 11: 2 });
});

test('soal hanya bertukar dengan soal bertipe sama dan opsi hanya diacak untuk PG/PM', () => {
    for (let round = 0; round < 50; round++) {
        const order = makeExamOrder(questions, true, true)!;
        assert.deepEqual([...order.soal].sort(), questions.map(q => q.id));
        const shown = orderQuestions(questions, order);
        assert.deepEqual(shown.map(q => q.tipeSoal), questions.map(q => q.tipeSoal));
        assert.deepEqual(Object.keys(order.opsi).sort(), ['11', '12', '13', '15']);
        for (const map of Object.values(order.opsi)) assert.deepEqual([...map].sort(), [0, 1, 2, 3]);
    }
    const onlyOptions = makeExamOrder(questions, false, true)!;
    assert.deepEqual(onlyOptions.soal, questions.map(q => q.id));
    const onlyQuestions = makeExamOrder(questions, true, false)!;
    assert.deepEqual(onlyQuestions.opsi, {});
});

test('jawaban posisi tampil diterjemahkan ke indeks asli dan sebaliknya', () => {
    const order = makeExamOrder(questions, true, true, rotate)!;
    assert.deepEqual(order.opsi[11], [1, 2, 3, 0]);
    assert.deepEqual(orderItems(11, ['a', 'b', 'c', 'd'], order), ['b', 'c', 'd', 'a']);
    const display = { 11: 0, 13: [3, 1], 14: [true, null], 16: 'esai', 17: 'x' };
    const original = answersToOriginal(display, order);
    assert.deepEqual(original, { 11: 1, 13: [0, 2], 14: [true, null], 16: 'esai', 17: 'x' });
    assert.deepEqual(answersToDisplay(original, order), display);
    // Nilai tidak valid tidak diubah agar ditolak validasi.
    assert.deepEqual(answersToOriginal({ 11: 9, 13: [-1, 'a'], 12: null }, order), { 11: 9, 13: [-1, 'a'], 12: null });
    assert.deepEqual(answersToOriginal([1], order), [1]);
});

test('pengacakan per tipe mempertahankan bagian PG, menjodohkan, dan esai', () => {
    const rows = ['PG', 'JODOH', 'ESSAY', 'pg', 'JODOH', 'ESSAY', 'BS'].map((tipeSoal, index) => ({
        id: index + 1, tipeSoal, isi: {}
    }));
    const order = makeExamOrder(rows, true, false, rotate);
    assert.deepEqual(order?.soal, [4, 5, 6, 1, 2, 3, 7]);
    assert.deepEqual(orderQuestions(rows, order).map(row => row.tipeSoal.toUpperCase()), rows.map(row => row.tipeSoal.toUpperCase()));
});

test('urutan draf mendahulukan tipe soal dan menyisipkan impor baru di akhir tipenya', () => {
    const rows = [
        { id: 1, tipeSoal: 'ESSAY', urutan: null },
        { id: 2, tipeSoal: 'PG', urutan: 2 },
        { id: 3, tipeSoal: 'BS', urutan: null },
        { id: 4, tipeSoal: 'JODOH', urutan: null },
        { id: 5, tipeSoal: 'ISIAN', urutan: null },
        { id: 6, tipeSoal: 'PM', urutan: null },
        { id: 7, tipeSoal: 'PG', urutan: 1 },
        { id: 8, tipeSoal: 'PG', urutan: null }
    ];
    const ordered = sortQuestions(rows);
    assert.deepEqual(ordered.map(row => row.id), [7, 2, 8, 6, 4, 3, 5, 1]);
    assert.deepEqual(makeExamOrder(ordered, true, false, rotate)?.soal, [2, 8, 7, 6, 4, 3, 5, 1]);
});

test('siswa yang memilih kunci di posisi tampil tetap dinilai benar', () => {
    const rows = questions.filter(q => q.tipeSoal === 'PG' || q.tipeSoal === 'PM').map(q => ({
        ...q, isi: q.isi as Prisma.JsonObject, bobot: new Prisma.Decimal(25), dibatalkan: false, semuaBenar: false
    }));
    for (let round = 0; round < 20; round++) {
        const order = makeExamOrder(rows, true, true)!;
        const picked: Record<string, number | number[]> = {};
        for (const q of orderQuestions(rows, order)) {
            const shown = orderItems(q.id, (q.isi.items as { benar: boolean }[]), order);
            const keys = shown.flatMap((item, index) => item.benar ? [index] : []);
            picked[q.id] = q.tipeSoal === 'PG' ? keys[0] : keys;
        }
        assert.equal(grade(rows, answersToOriginal(picked, order), null).values.totalNilai, '100.00');
    }
});

test('urutan tersimpan yang rusak diabaikan', () => {
    assert.equal(parseExamOrder(null), null);
    assert.equal(parseExamOrder({ soal: ['a'] }), null);
    assert.deepEqual(parseExamOrder({ soal: [2, 1], opsi: { 1: [1, 0], 2: [0, 0], 3: 'x' } }), { soal: [2, 1], opsi: { 1: [1, 0] } });
    // Soal yang tidak ada di urutan diletakkan di akhir; opsi dengan jumlah berbeda memakai urutan asli.
    assert.deepEqual(orderQuestions([{ id: 1 }, { id: 2 }, { id: 3 }], { soal: [2, 1], opsi: {} }).map(q => q.id), [2, 1, 3]);
    assert.deepEqual(orderItems(1, ['a', 'b', 'c'], { soal: [], opsi: { 1: [1, 0] } }), ['a', 'b', 'c']);
});

test('matching options are independently shuffled and keys grade original positions', () => {
    const pasangan = [{ kiri: 'Indonesia', kanan: 'Jakarta' }, { kiri: 'Jepang', kanan: 'Tokyo' }, { kiri: 'Mesir', kanan: 'Kairo' }];
    const question = { id: 20, tipeSoal: 'JODOH', isi: { pasangan }, bobot: new Prisma.Decimal(100), dibatalkan: false, semuaBenar: false };
    const order = parseExamOrder(makeExamOrder([question], false, false, rotate));
    assert.deepEqual(orderItems(20, pasangan.map(pair => pair.kanan), order), ['Tokyo', 'Kairo', 'Jakarta']);

    const display = { 20: [2, null, 1] };
    const original = answersToOriginal(display, order);
    assert.deepEqual(original, { 20: [0, null, 2] });
    assert.deepEqual(answersToDisplay(original, order), display);
    assert.deepEqual(answerSummary([question], original), { total: 1, answered: 0, partial: 1, missing: 0 });
    const studentQuestion = { tipeSoal: 'JODOH', items: pasangan.map(pair => ({ teks: pair.kiri })) };
    assert.equal(answerState(studentQuestion, display[20]), 'Belum lengkap');
    assert.equal(answerState(studentQuestion, [null, null, null]), 'Kosong');
    assert.equal(answerState(studentQuestion, [2, 0, 1]), 'Terjawab');
    assert.equal(grade([question], original, null).values.totalNilai, '0.00');
    assert.equal(grade([question], answersToOriginal({ 20: [2, 0, 1] }, order), null).values.totalNilai, '100.00');
    assert.throws(() => revise([question], 20, 'ubah-kunci', [0, 0, 2], {}), /berbeda/);
    const revised = revise([question], 20, 'ubah-kunci', [1, 0, 2], {});
    assert.equal(grade(revised, { 20: [1, 0, 2] }, null).values.totalNilai, '100.00');
    assert.equal(grade(revised, { 20: [0, 1, 2] }, null).values.totalNilai, '0.00');
});

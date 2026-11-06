import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { calculatePoints } from '../src/routes/examPoints';
import { essayLimit, grade } from '../src/routes/examGrading';

const questions = (points: number[]) => points.map((value, index) => ({ id: index + 1, tipeSoal: 'ESSAY', bobot: new Prisma.Decimal(value) }));
const total = (rows: { poin: string }[]) => rows.reduce((sum, row) => sum + Math.round(Number(row.poin) * 10000), 0);

test('an essay-only exam can publish with one question or a raw total below or above 100', () => {
    assert.equal(calculatePoints(questions([20]), {}).rows[0].poin, '100.0000');
    for (const points of [[10, 10, 10, 10, 10], [60, 60], [10, 20], [100]]) {
        const plan = calculatePoints(questions(points), {});
        assert.equal(total(plan.rows), 1000000);
        assert.ok(plan.rows.every(row => Number(row.poin) > 0));
    }
    assert.deepEqual(calculatePoints(questions([10, 20]), {}).rows.map(row => row.poin), ['33.3333', '66.6667']);
});

test('essay-only rounding preserves question order and exactly 100 total points', () => {
    const plan = calculatePoints(questions([1, 1, 1]), {});
    assert.deepEqual(plan.rows.map(row => row.id), [1, 2, 3]);
    assert.deepEqual(plan.rows.map(row => row.poin), ['33.3334', '33.3333', '33.3333']);
    assert.equal(total(plan.rows), 1000000);
});

test('normalized essay weights retain raw marking limits and grade partial and full marks correctly', () => {
    const raw = questions([20, 30]);
    const plan = calculatePoints(raw, {});
    const published = raw.map(question => ({ ...question, bobot: new Prisma.Decimal(plan.rows.find(row => row.id === question.id)!.poin),
        isi: { poinEssay: question.bobot.toNumber() }, dibatalkan: false, semuaBenar: false }));
    assert.deepEqual(published.map(essayLimit), [20, 30]);
    assert.equal(grade(published, {}, { 1: 10, 2: 15 }).values.totalNilai, '50.00');
    assert.equal(grade(published, {}, { 1: 20, 2: 30 }).values.totalNilai, '100.00');
    assert.equal(grade(published, {}, { 1: 0, 2: 0 }).values.totalNilai, '0.00');
    assert.equal(grade(published, {}, { 1: 20 }).pending, 1);
});

test('mixed exams keep the existing essay allocation and automatic distribution', () => {
    const mixed = ['PG', 'PM', 'BS', 'ISIAN', 'ESSAY'].map((tipeSoal, index) => ({ id: index + 1, tipeSoal, bobot: new Prisma.Decimal(tipeSoal === 'ESSAY' ? 50 : 0) }));
    const plan = calculatePoints(mixed, {});
    assert.deepEqual(plan.rows.map(row => row.poin), ['12.5000', '12.5000', '12.5000', '12.5000', '50.0000']);
    assert.deepEqual(calculatePoints(mixed, { PM: 10 }).rows.map(row => row.poin), ['13.3334', '10.0000', '13.3333', '13.3333', '50.0000']);
    mixed[4].bobot = new Prisma.Decimal(100);
    assert.throws(() => calculatePoints(mixed, {}), /Sisakan poin positif/);
    assert.throws(() => calculatePoints([{ id: 1, tipeSoal: 'PM', bobot: new Prisma.Decimal(0) }], { PM: 10 }), /tepat 100/);
});

test('empty exams and invalid essay maxima are rejected before normalization', () => {
    assert.throws(() => calculatePoints([], {}), /minimal satu soal/);
    assert.throws(() => calculatePoints(questions([0]), {}), /lebih dari 0/);
    assert.throws(() => calculatePoints(questions([-1, 1]), {}), /lebih dari 0/);
});

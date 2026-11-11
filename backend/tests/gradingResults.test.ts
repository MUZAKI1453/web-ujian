import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { grade, revise } from '../src/routes/examGrading';

const short = (answers: string[], numeric = false) => ({ id: 1, tipeSoal: 'ISIAN', isi: { jawaban: answers, angka: numeric }, bobot: new Prisma.Decimal(10), dibatalkan: false, semuaBenar: false });

test('short answer correctness uses the same alternatives, case and whitespace normalization as scores', () => {
    const question = short(['DKI Jakarta', 'Jakarta']);
    for (const value of ['Jakarta', ' JAKARTA ', 'dki   jakarta']) {
        const result = grade([question], { 1: value }, {});
        assert.deepEqual(result.penilaian['1'], { benar: true, poin: '10.0000', maksimum: '10.0000' });
        assert.equal(result.values.totalNilai, '10.00');
    }
    for (const value of ['Bandung', '', '  ', null, undefined]) {
        const result = grade([question], { 1: value }, {});
        assert.equal(result.penilaian['1'].benar, false);
        assert.equal(result.penilaian['1'].poin, '0.0000');
    }
});

test('short answer results retain legacy numeric equivalence and accept-all corrections', () => {
    assert.equal(grade([short(['1,5'], true)], { 1: '1.50' }, {}).penilaian['1'].benar, true);
    assert.equal(grade([short(['1,5'])], { 1: '1.5' }, {}).penilaian['1'].benar, false);
    assert.equal(grade([{ ...short(['Jakarta']), semuaBenar: true }], {}, {}).penilaian['1'].benar, true);
    assert.equal(grade([{ ...short(['Jakarta']), dibatalkan: true }], { 1: 'Jakarta' }, {}).penilaian['1'], undefined);
});

test('per-question results agree with totals for all automatic question types', () => {
    const items = [{ teks: 'A', benar: true }, { teks: 'B', benar: false }, { teks: 'C', benar: true }];
    const questions = [
        { ...short([]), id: 1, tipeSoal: 'PG', isi: { items: [{ teks: 'A', benar: true }, { teks: 'B', benar: false }] } },
        { ...short([]), id: 2, tipeSoal: 'PM', isi: { items } },
        { ...short([]), id: 3, tipeSoal: 'BS', isi: { items } }
    ];
    const allCorrect = grade(questions, { 1: 0, 2: [0, 2], 3: [true, false, true] }, {});
    assert.ok(Object.values(allCorrect.penilaian).every(result => result.benar));
    assert.equal(allCorrect.values.totalNilai, '30.00');
    const incorrect = grade(questions, { 1: 1, 2: [0], 3: [true, true, true] }, {});
    assert.ok(Object.values(incorrect.penilaian).every(result => !result.benar));
    assert.equal(incorrect.values.totalNilai, '0.00');
});

test('a revised multiple-choice key can contain exactly one answer', () => {
    const question = { ...short([]), tipeSoal: 'PM', isi: { items: [{ benar: true }, { benar: true }] } };
    const revised = revise([question], question.id, 'ubah-kunci', [true, false], {});
    assert.equal(grade(revised, { 1: [0] }, {}).rincian.PM.benar, 1);
    assert.equal(grade(revised, { 1: [0, 1] }, {}).rincian.PM.benar, 0);
    assert.throws(() => revise([question], question.id, 'ubah-kunci', [false, false], {}), /minimal satu kunci/);
});

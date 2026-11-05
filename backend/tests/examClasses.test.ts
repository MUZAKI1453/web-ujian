import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { examClassIds, parseClassIds, studentClassScope } from '../src/routes/examClasses';

test('class selection requires unique positive integer IDs', () => {
    assert.deepEqual(parseClassIds([1, 2, 3]), [1, 2, 3]);
    assert.deepEqual(parseClassIds([7]), [7]);
    for (const value of [undefined, null, [], '1', ['1'], [1, 1], [0], [-1], [1.5], [NaN], [2147483648], new Array(501).fill(1)]) {
        assert.equal(parseClassIds(value), null);
    }
});

test('legacy and target classes are combined without duplicate IDs', () => {
    assert.deepEqual(examClassIds({ kelasId: 1, kelasTujuan: [{ id: 1 }, { id: 2 }, { id: 3 }] }), [1, 2, 3]);
    assert.deepEqual(examClassIds({ kelasId: 1, kelasTujuan: [] }), [1]);
});

test('database: students can access all target classes, unrelated classes are excluded, and legacy exams still work', {
    skip: process.env.RUN_DATABASE_TESTS !== '1'
}, async () => {
    dotenv.config({ quiet: true });
    const db = new PrismaClient();
    const rollback = new Error('ROLLBACK_TEST_FIXTURES');
    const prefix = 'test-multiclass-' + randomUUID();
    try {
        await assert.rejects(db.$transaction(async tx => {
            const classes = await Promise.all(['7A', '7B', '7C', '8A'].map(name => tx.kelas.create({ data: { namaKelas: prefix + name } })));
            const subject = await tx.mapel.create({ data: { nama: prefix } });
            const schedule = { waktuMulai: new Date(), waktuSelesai: new Date(Date.now() + 3600000), durasiMenit: 60 };
            const exam = await tx.ujian.create({ data: {
                ...schedule, judul: prefix, mapelId: subject.id, kelasId: classes[0].id,
                kelasTujuan: { connect: classes.slice(0, 3).map(item => ({ id: item.id })) }
            }, include: { kelasTujuan: true } });
            assert.equal(exam.kelasTujuan.length, 3);
            for (const item of classes.slice(0, 3)) {
                assert.equal(await tx.ujian.count({ where: { id: exam.id, ...studentClassScope(item.id) } }), 1);
            }
            assert.equal(await tx.ujian.count({ where: { id: exam.id, ...studentClassScope(classes[3].id) } }), 0);
            const legacy = await tx.ujian.create({ data: { ...schedule, judul: prefix + '-legacy', mapelId: subject.id, kelasId: classes[0].id } });
            assert.equal(await tx.ujian.count({ where: { id: legacy.id, ...studentClassScope(classes[0].id) } }), 1);
            assert.equal(await tx.ujian.count({ where: { id: legacy.id, ...studentClassScope(classes[1].id) } }), 0);
            throw rollback;
        }, { timeout: 20000 }), error => error === rollback);
    } finally { await db.$disconnect(); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import dotenv from 'dotenv';

test('API: master permissions, dropdown, required type, draft changes, historical names, and deletion protection', {
    skip: process.env.RUN_DATABASE_TESTS !== '1'
}, async () => {
    dotenv.config({ quiet: true });
    const [{ default: express }, { default: jwt }, { default: admin }, { default: guru }, { default: db }, { jwtSecret }] = await Promise.all([
        import('express'), import('jsonwebtoken'), import('../src/routes/adminRoutes'), import('../src/routes/guruRoutes'),
        import('../src/config/db'), import('../src/middleware/auth')
    ]);
    const prefix = 'jenis-test-' + randomUUID();
    const users: number[] = [], exams: number[] = [], types: number[] = [];
    let classId: number | undefined, subjectId: number | undefined;
    const app = express(); app.use(express.json()); app.use('/admin', admin); app.use('/guru', guru);
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address(); assert.ok(address && typeof address !== 'string');
        const base = `http://127.0.0.1:${address.port}`;
        for (const role of ['admin', 'guru']) {
            const user = await db.user.create({ data: { username: randomUUID(), password: 'unused-test-account', role } });
            users.push(user.id);
        }
        classId = (await db.kelas.create({ data: { namaKelas: prefix } })).id;
        subjectId = (await db.mapel.create({ data: { nama: prefix } })).id;
        await db.guruMapelKelas.create({ data: { guruId: users[1], mapelId: subjectId, kelasId: classId } });
        const tokens = users.map(id => jwt.sign({ id }, jwtSecret, { expiresIn: '5m' }));
        async function request(path: string, method = 'GET', body?: unknown, actor = 0) {
            const res = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + tokens[actor], 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
            return { status: res.status, data: await res.json() as any };
        }
        assert.equal((await request('/admin/jenis-ujian', 'GET', undefined, 1)).status, 403);
        assert.equal((await request('/admin/jenis-ujian', 'POST', { nama: prefix }, 1)).status, 403);
        assert.equal((await request('/admin/jenis-ujian', 'POST', { nama: '  ' })).status, 400);
        const created = await request('/admin/jenis-ujian', 'POST', { nama: '  ' + prefix + '  ' });
        assert.equal(created.status, 201); types.push(created.data.id);
        assert.equal(created.data.nama, prefix);
        assert.equal((await request('/admin/jenis-ujian', 'POST', { nama: prefix })).status, 409);
        const other = await request('/admin/jenis-ujian', 'POST', { nama: prefix + '-other' });
        assert.equal(other.status, 201); types.push(other.data.id);
        const listing = await request('/guru/ujian', 'GET', undefined, 1);
        assert.ok(listing.data.jenisUjian.some((item: { id: number }) => item.id === types[0]));
        const payload = { mapelId: subjectId, kelasIds: [classId], durasiMenit: 30,
            waktuMulai: new Date().toISOString(), waktuSelesai: new Date(Date.now() + 3600000).toISOString() };
        for (const jenisUjianId of [undefined, null, '1', 0, 2147483647]) {
            assert.equal((await request('/guru/ujian', 'POST', { ...payload, jenisUjianId }, 1)).status, 400);
        }
        assert.equal((await request('/guru/ujian', 'POST', { ...payload, jenisUjianId: types[0], rilisHasilOtomatis: 'true' }, 1)).status, 400);
        const exam = await request('/guru/ujian', 'POST', { ...payload, jenisUjianId: types[0], judul: 'untrusted title', rilisHasilOtomatis: true }, 1);
        assert.equal(exam.status, 201); exams.push(exam.data.id);
        assert.equal(exam.data.hasilRilis, true);
        assert.equal((await db.ujian.findUniqueOrThrow({ where: { id: exams[0] }, select: { bahasanRilis: true } })).bahasanRilis, false);
        assert.equal(exam.data.judul, prefix); assert.equal(exam.data.jenisUjianId, types[0]);
        assert.equal((await request('/admin/jenis-ujian/' + types[0], 'DELETE')).status, 409);
        const editBody = { ...payload, jenisUjianId: types[1], soalAwal: [], perubahan: [], hapus: [] };
        const edited = await request('/guru/ujian/' + exams[0] + '/draf', 'PUT', editBody, 1);
        assert.equal(edited.data.hasilRilis, true);
        assert.equal(edited.status, 200); assert.equal(edited.data.judul, prefix + '-other');
        await db.ujian.update({ where: { id: exams[0] }, data: { draf: false } });
        assert.equal((await request('/admin/jenis-ujian/' + types[1], 'PUT', { nama: prefix + '-renamed' })).status, 200);
        assert.equal((await request('/guru/ujian/' + exams[0], 'GET', undefined, 1)).data.judul, prefix + '-other');
        assert.equal((await request('/guru/ujian/' + exams[0] + '/draf', 'PUT', editBody, 1)).status, 409);
        assert.equal((await request('/admin/jenis-ujian/' + types[1], 'DELETE')).status, 409);
        assert.equal((await request('/admin/jenis-ujian/' + types[0], 'DELETE')).status, 200);
        // Legacy records remain readable and gain the relation when their draft is saved.
        const legacy = await db.ujian.create({ data: { judul: prefix + '-legacy', guruId: users[1], mapelId: subjectId, kelasId: classId,
            draf: true, durasiMenit: 30, waktuMulai: new Date(), waktuSelesai: new Date(Date.now() + 3600000) } });
        exams.push(legacy.id);
        assert.equal((await request('/guru/ujian/' + legacy.id, 'GET', undefined, 1)).data.jenisUjianId, null);
        assert.equal((await request('/guru/ujian/' + legacy.id + '/draf', 'PUT', { ...editBody, jenisUjianId: null }, 1)).status, 400);
        assert.equal((await request('/guru/ujian/' + legacy.id + '/draf', 'PUT', editBody, 1)).status, 200);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        try {
            if (exams.length) await db.ujian.deleteMany({ where: { id: { in: exams } } });
            if (types.length) await db.jenisUjian.deleteMany({ where: { id: { in: types } } });
            if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
            if (classId) await db.kelas.delete({ where: { id: classId } });
            if (subjectId) await db.mapel.delete({ where: { id: subjectId } });
        } finally { await db.$disconnect(); }
    }
});

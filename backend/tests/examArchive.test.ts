import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';

test('exam management scopes deletion to drafts and archives only after all sessions end', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/guruRoutes')
    ]);
    const scope = { id: 7, OR: [{ guruId: 3 }, { guru: { role: 'admin' }, OR: [] }] };
    const past = new Date(0);
    const future = new Date('2099-01-01T00:00:00Z');
    const exam = { waktuSelesai: future, diarsipkanPada: null as Date | null, susulan: [{ waktuSelesai: future }] };
    let draftExists = true;
    let writes = 0;
    const { findMany } = db.guruMapelKelas;
    const { deleteMany } = db.ujian;
    const transaction = db.$transaction;
    db.guruMapelKelas.findMany = (async () => []) as typeof findMany;
    db.ujian.deleteMany = (async ({ where }) => {
        assert.deepEqual(where, { ...scope, draf: true });
        const count = Number(draftExists);
        draftExists = false;
        return { count };
    }) as typeof deleteMany;
    db.$transaction = (async run => run({
        $queryRaw: async () => [],
        ujian: {
            findFirst: async ({ where }: { where: unknown }) => {
                assert.deepEqual(where, { ...scope, draf: false });
                return exam;
            },
            update: async ({ where, data }: { where: unknown; data: { diarsipkanPada: Date | null } }) => {
                assert.deepEqual(where, { id: 7 });
                assert.deepEqual(Object.keys(data), ['diarsipkanPada']);
                exam.diarsipkanPada = data.diarsipkanPada;
                writes++;
            }
        }
    })) as typeof transaction;

    async function call(path: string, arsip?: boolean) {
        const handler = router.stack.find(layer => layer.route?.path === path)!.route.stack[0].handle;
        let status = 200;
        const response = {
            locals: { user: { id: 3, role: 'guru' } },
            status(code: number) { status = code; return this; },
            sendStatus(code: number) { status = code; },
            json() {}
        };
        await handler({ params: { id: '7' }, body: { arsip } }, response);
        return status;
    }

    try {
        assert.equal(await call('/ujian/:id'), 204);
        assert.equal(await call('/ujian/:id'), 404);
        assert.equal(await call('/ujian/:id/arsip', true), 409);
        exam.waktuSelesai = past;
        assert.equal(await call('/ujian/:id/arsip', true), 409);
        assert.equal(writes, 0);
        exam.susulan[0].waktuSelesai = past;
        assert.equal(await call('/ujian/:id/arsip', true), 200);
        const archivedAt = exam.diarsipkanPada;
        assert.ok(archivedAt instanceof Date);
        assert.equal(await call('/ujian/:id/arsip', true), 200);
        assert.equal(exam.diarsipkanPada, archivedAt);
        assert.equal(await call('/ujian/:id/arsip', false), 200);
        assert.equal(exam.diarsipkanPada, null);
    } finally {
        db.guruMapelKelas.findMany = findMany;
        db.ujian.deleteMany = deleteMany;
        db.$transaction = transaction;
        await db.$disconnect();
    }
});

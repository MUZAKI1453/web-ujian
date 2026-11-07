import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

test('selected exam types reject invalid selections and delete in one protected operation', async t => {
    t.mock.method(PrismaClient.prototype, '$connect', async () => {});
    const [{ default: db }, { default: router }] = await Promise.all([
        import('../src/config/db'), import('../src/routes/jenisUjianRoutes')
    ]);
    const handler = router.stack.find(layer => layer.route?.path === '/hapus-terpilih')!.route.stack[0].handle;
    const original = db.jenisUjian.deleteMany;
    const write = t.mock.fn(async (_args: unknown) => ({ count: 2 }));
    db.jenisUjian.deleteMany = write as typeof original;
    async function request(ids: unknown) {
        const result = { status: 200, body: {} as { message?: string } };
        const res = {
            status(code: number) { result.status = code; return res; },
            json(body: { message?: string }) { result.body = body; return res; }
        };
        await handler({ body: { ids } } as Request, res as Response, () => {});
        return result;
    }
    try {
        for (const ids of [undefined, null, [], ['1'], [0], [-1], [1.5], [1, 1], [2147483648], Array.from({ length: 501 }, (_, i) => i + 1)]) {
            assert.equal((await request(ids)).status, 400);
        }
        assert.equal(write.mock.callCount(), 0);
        assert.equal((await request([1, 2])).status, 200);
        assert.equal(write.mock.callCount(), 1);
        assert.deepEqual(write.mock.calls[0].arguments[0], { where: { id: { in: [1, 2] } } });
        db.jenisUjian.deleteMany = (async () => {
            throw new Prisma.PrismaClientKnownRequestError('foreign key restrict', {
                code: 'P2003', clientVersion: Prisma.prismaVersion.client
            });
        }) as typeof original;
        const protectedResult = await request([1, 2]);
        assert.equal(protectedResult.status, 409);
        assert.match(protectedResult.body.message!, /sudah digunakan/);
    } finally {
        db.jenisUjian.deleteMany = original;
        await db.$disconnect();
    }
});

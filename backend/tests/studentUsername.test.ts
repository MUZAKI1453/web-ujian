import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

let db: PrismaClient;
let controllers: typeof import('../src/controllers/adminController');

before(async () => {
    // Exercise the real controllers without opening a database connection.
    const connect = mock.method(PrismaClient.prototype, '$connect', async () => {});
    db = (await import('../src/config/db')).default;
    controllers = await import('../src/controllers/adminController');
    connect.mock.restore();
});

after(() => mock.restoreAll());

function response() {
    const result = { code: 200, body: {} as Record<string, unknown> };
    const res = {
        status(code: number) { result.code = code; return res; },
        json(body: Record<string, unknown>) { result.body = body; return res; }
    };
    return { result, res: res as unknown as Response };
}

function stub(method: 'findUnique' | 'create' | 'update', implementation: (...args: any[]) => any) {
    // Prisma model methods are supplied by a proxy rather than own descriptors.
    const model = db.user as any;
    const original = model[method];
    const fn = mock.fn(implementation);
    model[method] = fn;
    return { mock: {
        callCount: () => fn.mock.callCount(),
        get calls() { return fn.mock.calls; },
        restore() { model[method] = original; }
    } };
}

const request = {
    body: { username: '12345', nama: 'Siswa Uji', kelasId: 1 },
    params: { id: '1' }
} as unknown as Request;

function duplicateError() {
    return new Prisma.PrismaClientKnownRequestError('Internal Prisma invocation and path', {
        code: 'P2002', clientVersion: Prisma.prismaVersion.client, meta: { target: ['username'] }
    });
}

for (const operation of ['create', 'update'] as const) {
    test(`${operation} siswa reports a username conflict if another request wins after the precheck`, async () => {
        const lookup = stub('findUnique', async (args: any) =>
            args.where.id ? { id: 1, role: 'siswa', username: '54321' } : null);
        const write = stub(operation, async () => { throw duplicateError(); });
        try {
            const { res, result } = response();
            await controllers[operation === 'create' ? 'createSiswa' : 'updateSiswa'](request, res);
            assert.equal(write.mock.callCount(), 1);
            assert.equal(result.code, 409);
            assert.equal(result.body.status, 'WARNING');
            assert.match(String(result.body.message), /NIS sudah digunakan akun lain/);
            assert.doesNotMatch(String(result.body.message), /Prisma|invocation/);
        } finally {
            lookup.mock.restore(); write.mock.restore();
        }
    });
}

test('an existing account prevents student creation before a write', async () => {
    const lookup = stub('findUnique', async () => ({ id: 2, role: 'guru' }));
    const write = stub('create', async () => { throw new Error('Unexpected write'); });
    try {
        const { res, result } = response();
        await controllers.createSiswa(request, res);
        assert.equal(result.code, 409);
        assert.equal(write.mock.callCount(), 0);
    } finally {
        lookup.mock.restore(); write.mock.restore();
    }
});

test('a new NIS still creates a student with a hashed password', async () => {
    const lookup = stub('findUnique', async () => null);
    const student = { id: 3, username: '12345', nama: 'Siswa Uji', kelas: { id: 1 } };
    const write = stub('create', async () => student);
    try {
        const { res, result } = response();
        await controllers.createSiswa(request, res);
        assert.equal(result.code, 201);
        assert.deepEqual(result.body.data, student);
        const data = (write.mock.calls[0].arguments as any[])[0].data;
        assert.equal(data.username, '12345');
        assert.equal(data.role, 'siswa');
        const bcrypt = await import('bcrypt');
        assert.equal(await bcrypt.compare('12345', data.password), true);
    } finally {
        lookup.mock.restore(); write.mock.restore();
    }
});

test('unrelated database errors remain server errors without exposing Prisma details', async () => {
    const lookup = stub('findUnique', async () => { throw new Error('Internal database path'); });
    const log = mock.method(console, 'error', () => {});
    try {
        const { res, result } = response();
        await controllers.createSiswa(request, res);
        assert.equal(result.code, 500);
        assert.equal(result.body.message, 'Gagal menambahkan siswa. Coba lagi.');
        assert.equal(log.mock.callCount(), 1);
    } finally {
        lookup.mock.restore(); log.mock.restore();
    }
});

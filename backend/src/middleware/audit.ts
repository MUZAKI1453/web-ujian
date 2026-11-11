import { NextFunction, Request, Response } from 'express';
import prisma from '../config/db';

type AuditEntry = {
    aksi: string; status: number; target?: string | null;
    pelakuId?: number | null; pelaku?: string | null; peran?: string | null;
};

const cut = (value: string | null | undefined, max: number) => value ? value.slice(0, max) : null;

// Pencatatan tidak boleh menggagalkan atau menunda permintaan; kegagalan hanya dicatat di log server.
export function writeAudit(req: Request, entry: AuditEntry) {
    prisma.auditLog.create({ data: {
        aksi: entry.aksi.slice(0, 120), status: entry.status, target: cut(entry.target, 191),
        pelakuId: entry.pelakuId ?? null, pelaku: cut(entry.pelaku, 50), peran: cut(entry.peran, 20),
        ip: cut(req.ip ?? req.socket.remoteAddress, 45), userAgent: cut(req.get('User-Agent'), 255)
    } }).catch(error => console.error('Audit log:', error));
}

// Mencatat setiap permintaan yang mengubah data (selain GET) dari pengguna yang sudah login.
// Aksi ditulis sebagai pola rute, mis. "POST /api/admin/siswa/:id/reset-password"; target memuat alamat lengkapnya.
export function auditMutations(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const path = req.originalUrl.split('?')[0];
    res.on('finish', () => {
        const user = res.locals.user as { id: number; username?: string; role?: string } | undefined;
        if (!user) return;
        writeAudit(req, {
            aksi: req.method + ' ' + path.replace(/\/\d+(?=\/|$)/g, '/:id'), target: path, status: res.statusCode,
            pelakuId: user.id, pelaku: user.username, peran: user.role
        });
    });
    next();
}

// Catatan disimpan 180 hari.
export async function pruneAudit() {
    await prisma.auditLog.deleteMany({ where: { waktu: { lt: new Date(Date.now() - 180 * 86400000) } } });
}

export async function listAudit(req: Request, res: Response, next: NextFunction) {
    try {
        const page = Math.max(1, Math.min(Number(req.query.halaman) || 1, 100000));
        const text = typeof req.query.cari === 'string' ? req.query.cari.trim().slice(0, 100) : '';
        const kind = req.query.jenis;
        const where = {
            ...(kind === 'login' ? { aksi: { startsWith: 'login' } } : kind === 'gagal' ? { status: { gte: 400 } } : {}),
            ...(text ? { OR: [{ pelaku: { contains: text } }, { aksi: { contains: text } }, { target: { contains: text } }, { ip: { contains: text } }] } : {})
        };
        const size = 50;
        const [total, data] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * size, take: size })
        ]);
        res.json({ total, halaman: page, ukuran: size, data });
    } catch (error) { next(error); }
}

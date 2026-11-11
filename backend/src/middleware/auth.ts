import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import prisma from '../config/db';

function loadSecret() {
    const secret = process.env.JWT_SECRET ?? '';
    const placeholder = !secret || /ganti|secret|changeme|password/i.test(secret);
    if (secret.length >= 32 && !placeholder) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET belum diisi. Isi backend/.env dengan nilai acak minimal 32 karakter, misalnya hasil "openssl rand -hex 32".');
    }
    console.warn('⚠️  JWT_SECRET kosong atau masih nilai contoh. Memakai secret acak sementara; semua sesi berakhir saat server dimulai ulang.');
    return randomBytes(32).toString('hex');
}

export const jwtSecret = loadSecret();

function bearer(req: Request) {
    return req.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
}

function verify(token: string | undefined) {
    if (!token) return null;
    try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
        return typeof payload !== 'string' && Number.isSafeInteger(payload.id) ? payload : null;
    } catch {
        // Token kedaluwarsa atau tidak valid.
        return null;
    }
}

// Pemeriksaan tanda tangan saja (tanpa database), dipasang sebelum body parser
// agar permintaan tanpa login tidak membebani server dengan body besar.
export function requireToken(req: Request, res: Response, next: NextFunction) {
    if (!verify(bearer(req))) return res.status(401).json({ status: 'ERROR', message: 'Silakan login kembali.' });
    next();
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
    const payload = verify(bearer(req));
    if (!payload) {
        return res.status(401).json({ status: 'ERROR', message: 'Silakan login kembali.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, username: true, role: true, sesiLogin: true } });
        if (!user) return res.status(401).json({ status: 'ERROR', message: 'Akun tidak ditemukan.' });
        if ((user.role === 'siswa' || user.sesiLogin) && (!payload.sesiLogin || payload.sesiLogin !== user.sesiLogin)) {
            return res.status(401).json({ code: 'SESI_BERAKHIR', message: 'Sesi telah berakhir. Silakan login ulang.' });
        }
        // Token yang dibuat dari password bawaan hanya boleh dipakai untuk mengganti password atau keluar.
        if (payload.wajibGanti === true && !['/api/auth/password', '/api/auth/logout'].includes(req.originalUrl.split('?')[0])) {
            return res.status(403).json({ code: 'WAJIB_GANTI_PASSWORD', message: 'Ganti password bawaan sebelum melanjutkan.' });
        }
        res.locals.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (res.locals.user.role !== 'admin') {
        return res.status(403).json({ status: 'ERROR', message: 'Akses khusus admin.' });
    }
    next();
}

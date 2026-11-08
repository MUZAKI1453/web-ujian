import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import prisma from '../config/db';

export const jwtSecret = process.env.JWT_SECRET || randomBytes(32).toString('hex');

export async function requireUser(req: Request, res: Response, next: NextFunction) {
    const token = req.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    let id: number | undefined;
    let sesiLogin: string | undefined;
    if (token) {
        try {
            const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
            if (typeof payload !== 'string' && Number.isSafeInteger(payload.id)) { id = payload.id; sesiLogin = payload.sesiLogin; }
        } catch {
            // Token kedaluwarsa atau tidak valid.
        }
    }
    if (id === undefined) {
        return res.status(401).json({ status: 'ERROR', message: 'Silakan login kembali.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, sesiLogin: true } });
        if (!user) return res.status(401).json({ status: 'ERROR', message: 'Akun tidak ditemukan.' });
        if ((user.role === 'siswa' || user.sesiLogin) && (!sesiLogin || sesiLogin !== user.sesiLogin)) {
            return res.status(401).json({ code: 'SESI_BERAKHIR', message: 'Sesi telah berakhir. Silakan login ulang.' });
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

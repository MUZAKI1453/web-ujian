import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';

import { jwtSecret } from '../middleware/auth';

const loginWindow = 60_000;
const attempts = new Map<string, { count: number; expires: number }>();
const dummyHash = bcrypt.hashSync(randomBytes(18).toString('base64url'), 10);
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
        if (entry.expires <= now) attempts.delete(key);
    }
}, loginWindow).unref();

function consumeAttempt(key: string, limit: number, now: number) {
    let entry = attempts.get(key);
    if (!entry || entry.expires <= now) {
        if (!entry && attempts.size >= 20_000) return loginWindow;
        entry = { count: 0, expires: now + loginWindow };
        attempts.set(key, entry);
    }
    if (entry.count >= limit) return entry.expires - now;
    entry.count++;
    return 0;
}

export const loginUser = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (typeof username !== 'string' || username.length > 50 || typeof password !== 'string' || Buffer.byteLength(password) > 72) {
            return res.status(400).json({ message: 'NIS / NIP dan password wajib diisi.' });
        }
        const now = Date.now();
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const retry = consumeAttempt('ip:' + ip, 120, now) ||
            consumeAttempt('account:' + JSON.stringify([ip, username]), 5, now);
        if (retry) return res.set('Retry-After', String(Math.ceil(retry / 1000))).status(429)
            .json({ message: 'Terlalu banyak percobaan masuk. Coba lagi sebentar.' });
        // 1. Cari user berdasarkan username (bisa NIS, NIP, atau username admin)
        const user = await prisma.user.findUnique({
            where: { username },
            include: { kelas: true }
        });

        if (!user) {
            await bcrypt.compare(password, dummyHash);
            return res.status(401).json({ status: 'ERROR', message: 'NIS / NIP atau password salah!' });
        }

        // 2. Cek kecocokan password menggunakan bcrypt.compare
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ status: 'ERROR', message: 'NIS / NIP atau password salah!' });
        }

        // 3. Buat token JWT
        const sesiLogin = user.role === 'siswa' ? randomUUID() : user.sesiLogin ?? undefined;
        if (user.role === 'siswa') {
            const updated = await prisma.user.updateMany({ where: { id: user.id, password: user.password }, data: { sesiLogin } });
            if (!updated.count) return res.status(401).json({ message: 'NIS / NIP atau password salah!' });
        }
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, nama: user.nama, sesiLogin },
            jwtSecret,
            { expiresIn: '1d' }
        );

        res.json({
            status: 'SUCCESS',
            message: 'Login Berhasil!',
            token,
            user: {
                id: user.id,
                username: user.username,
                nama: user.nama,
                role: user.role,
                passwordBawaan: password === user.username || (user.role === 'admin' && password === 'admin123'),
                kelas: user.kelas ? user.kelas.namaKelas : null
            }
        });
    } catch (error: any) {
        console.error('Login:', error);
        res.status(500).json({ status: 'ERROR', message: 'Gagal masuk. Coba lagi.' });
    }
};
export const changePassword = async (req: Request, res: Response) => {
    const { passwordLama, passwordBaru } = req.body;
    if (typeof passwordLama !== 'string' || typeof passwordBaru !== 'string' ||
        passwordBaru.length < 8 || Buffer.byteLength(passwordBaru) > 72 || passwordBaru === passwordLama) {
        return res.status(400).json({ message: 'Gunakan password baru yang berbeda, minimal 8 karakter dan maksimal 72 byte.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: res.locals.user.id } });
        if (!user || Buffer.byteLength(passwordLama) > 72 || !(await bcrypt.compare(passwordLama, user.password))) {
            return res.status(400).json({ message: 'Password lama salah.' });
        }
        if (passwordBaru === user.username || passwordBaru === 'admin123') {
            return res.status(400).json({ message: 'Pilih password yang tidak mudah ditebak.' });
        }
        const result = await prisma.user.updateMany({
            where: { id: user.id, password: user.password },
            data: { password: await bcrypt.hash(passwordBaru, 10), sesiLogin: randomUUID() }
        });
        if (!result.count) return res.status(409).json({ message: 'Password sudah berubah. Coba lagi.' });
        res.json({ status: 'SUCCESS', message: 'Password berhasil diubah.' });
    } catch {
        res.status(500).json({ message: 'Gagal mengubah password.' });
    }
};

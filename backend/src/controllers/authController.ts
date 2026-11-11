import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';

import { jwtSecret } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

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
        if (!entry && attempts.size >= 50_000) return loginWindow;
        entry = { count: 0, expires: now + loginWindow };
        attempts.set(key, entry);
    }
    if (entry.count >= limit) return entry.expires - now;
    entry.count++;
    return 0;
}

function releaseAttempt(key: string) {
    const entry = attempts.get(key);
    if (entry && entry.count > 0) {
        entry.count--;
        if (entry.count === 0) attempts.delete(key);
    }
}

const commonPasswords = ['password', 'admin123', '12345678', 'qwerty', 'abc123', 'rahasia', 'sandi123', 'iloveyou', 'baitussalam'];

function signToken(user: { id: number; username: string; role: string; nama: string | null }, sesiLogin: string | null, wajibGanti: boolean) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, nama: user.nama, sesiLogin, ...(wajibGanti ? { wajibGanti: true } : {}) },
        jwtSecret,
        { expiresIn: '12h' }
    );
}

function isDefaultPassword(user: { username: string; role: string }, password: string) {
    return password === user.username || (user.role === 'admin' && password === 'admin123');
}

export const loginUser = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (typeof username !== 'string' || username.length > 50 || typeof password !== 'string' || Buffer.byteLength(password) > 72) {
            return res.status(400).json({ message: 'NIS / NIP dan password wajib diisi.' });
        }
        const now = Date.now();
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const ipKey = 'ip:' + ip;
        // Satu sekolah sering berbagi satu IP publik, jadi batas per IP dibuat longgar.
        // Batas per akun tidak bergantung pada IP agar tidak bisa dilewati dengan berganti alamat.
        const pairKey = 'pair:' + JSON.stringify([ip, username]);
        const accountKey = 'account:' + username;
        const retry = consumeAttempt(ipKey, 1500, now) ||
            consumeAttempt(pairKey, 5, now) ||
            consumeAttempt(accountKey, 20, now);
        if (retry) return res.set('Retry-After', String(Math.ceil(retry / 1000))).status(429)
            .json({ message: 'Terlalu banyak percobaan masuk. Coba lagi sebentar.' });
        // 1. Cari user berdasarkan username (bisa NIS, NIP, atau username admin)
        const user = await prisma.user.findUnique({
            where: { username },
            include: { kelas: true }
        });

        if (!user) {
            await bcrypt.compare(password, dummyHash);
            writeAudit(req, { aksi: 'login-gagal', status: 401, pelaku: username });
            return res.status(401).json({ status: 'ERROR', message: 'NIS / NIP atau password salah!' });
        }

        // 2. Cek kecocokan password menggunakan bcrypt.compare
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            writeAudit(req, { aksi: 'login-gagal', status: 401, pelakuId: user.id, pelaku: user.username, peran: user.role });
            return res.status(401).json({ status: 'ERROR', message: 'NIS / NIP atau password salah!' });
        }

        releaseAttempt(pairKey);
        releaseAttempt(accountKey);

        // 3. Buat token JWT
        // Siswa: satu sesi aktif; login baru mengakhiri sesi lama.
        // Guru/admin: sesi dipakai bersama antarperangkat dan berakhir saat keluar atau ganti password.
        let sesiLogin = user.sesiLogin;
        if (user.role === 'siswa') {
            sesiLogin = randomUUID();
            const updated = await prisma.user.updateMany({ where: { id: user.id, password: user.password }, data: { sesiLogin } });
            if (!updated.count) return res.status(401).json({ message: 'NIS / NIP atau password salah!' });
        } else if (!sesiLogin) {
            const account = { id: user.id, password: user.password };
            await prisma.user.updateMany({ where: { ...account, sesiLogin: null }, data: { sesiLogin: randomUUID() } });
            const current = await prisma.user.findUnique({ where: account, select: { sesiLogin: true } });
            if (!current?.sesiLogin) return res.status(401).json({ message: 'NIS / NIP atau password salah!' });
            sesiLogin = current.sesiLogin;
        }
        const passwordBawaan = isDefaultPassword(user, password);
        const token = signToken(user, sesiLogin, passwordBawaan);
        writeAudit(req, { aksi: 'login', status: 200, pelakuId: user.id, pelaku: user.username, peran: user.role });

        res.json({
            status: 'SUCCESS',
            message: 'Login Berhasil!',
            token,
            user: {
                id: user.id,
                username: user.username,
                nama: user.nama,
                role: user.role,
                passwordBawaan,
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
        const lower = passwordBaru.toLowerCase();
        if (!/[a-z]/i.test(passwordBaru) || !/\d/.test(passwordBaru)) {
            return res.status(400).json({ message: 'Password baru harus memuat huruf dan angka.' });
        }
        if (lower.includes(user.username.toLowerCase()) || commonPasswords.some(word => lower.includes(word))) {
            return res.status(400).json({ message: 'Pilih password yang tidak mudah ditebak dan tidak memuat NIS/NIP Anda.' });
        }
        const sesiLogin = randomUUID();
        const result = await prisma.user.updateMany({
            where: { id: user.id, password: user.password },
            data: { password: await bcrypt.hash(passwordBaru, 10), sesiLogin }
        });
        if (!result.count) return res.status(409).json({ message: 'Password sudah berubah. Coba lagi.' });
        writeAudit(req, { aksi: 'ganti-password', status: 200, pelakuId: user.id, pelaku: user.username, peran: user.role });
        // Sesi lama di semua perangkat berakhir; perangkat ini langsung menerima token baru.
        res.json({ status: 'SUCCESS', message: 'Password berhasil diubah.', token: signToken(user, sesiLogin, false) });
    } catch {
        res.status(500).json({ message: 'Gagal mengubah password.' });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    try {
        // Mengganti sesi membuat semua token lama akun ini tidak berlaku.
        await prisma.user.update({ where: { id: res.locals.user.id }, data: { sesiLogin: randomUUID() } });
        const { id, username, role } = res.locals.user;
        writeAudit(req, { aksi: 'logout', status: 204, pelakuId: id, pelaku: username, peran: role });
        res.sendStatus(204);
    } catch (error) {
        console.error('Logout:', error);
        res.status(500).json({ message: 'Gagal keluar. Coba lagi.' });
    }
};

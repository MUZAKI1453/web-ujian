import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

import { jwtSecret } from '../middleware/auth';

export const loginUser = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ message: 'Username dan password wajib diisi.' });
        }
        // 1. Cari user berdasarkan username (bisa NIS, NIP, atau username admin)
        const user = await prisma.user.findUnique({
            where: { username },
            include: { kelas: true }
        });

        if (!user) {
            return res.status(401).json({ status: 'ERROR', message: 'Username atau password salah!' });
        }

        // 2. Cek kecocokan password menggunakan bcrypt.compare
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ status: 'ERROR', message: 'Username atau password salah!' });
        }

        // 3. Buat token JWT
        const sesiLogin = user.role === 'siswa' ? randomUUID() : undefined;
        if (sesiLogin) await prisma.user.update({ where: { id: user.id }, data: { sesiLogin } });
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
                kelas: user.kelas ? user.kelas.namaKelas : null
            }
        });
    } catch (error: any) {
        res.status(500).json({ status: 'ERROR', message: error.message });
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
        if (!user || !(await bcrypt.compare(passwordLama, user.password))) {
            return res.status(400).json({ message: 'Password lama salah.' });
        }
        const result = await prisma.user.updateMany({
            where: { id: user.id, password: user.password },
            data: { password: await bcrypt.hash(passwordBaru, 10) }
        });
        if (!result.count) return res.status(409).json({ message: 'Password sudah berubah. Coba lagi.' });
        res.json({ status: 'SUCCESS', message: 'Password berhasil diubah.' });
    } catch {
        res.status(500).json({ message: 'Gagal mengubah password.' });
    }
};

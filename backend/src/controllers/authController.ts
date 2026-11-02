import { Request, Response } from 'express';
import prisma from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cbt_secret_key_2026';

export const loginUser = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

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
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, nama: user.nama },
            JWT_SECRET,
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
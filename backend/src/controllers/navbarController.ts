import { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../config/db';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024, fields: 1, fieldSize: 512 }
}).single('logo');

function imageType(buffer: Buffer) {
    if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
    if (buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
}

const settingsId = 1;
const select = { text: true, logo: true };

export async function getNavbar(req: Request, res: Response) {
    try {
        const settings = await prisma.navbarSettings.findUnique({ where: { id: settingsId }, select });
        res.json(settings);
    } catch (error) {
        console.error('Gagal memuat pengaturan navbar:', error);
        res.status(500).json({ message: 'Gagal memuat pengaturan navbar.' });
    }
}

export function updateNavbar(req: Request, res: Response) {
    upload(req, res, async error => {
        if (error) {
            return res.status(400).json({ message: 'Unggah satu gambar dengan ukuran maksimal 1 MB.' });
        }

        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text || text.length > 60) {
            return res.status(400).json({ message: 'Teks navbar harus berisi 1 sampai 60 karakter.' });
        }

        let logo: string | undefined;
        if (req.file) {
            const type = imageType(req.file.buffer);
            if (!type) return res.status(400).json({ message: 'Gunakan gambar PNG, JPG, atau WebP.' });
            logo = 'data:' + type + ';base64,' + req.file.buffer.toString('base64');
        }

        try {
            const settings = await prisma.navbarSettings.upsert({
                where: { id: settingsId },
                create: { id: settingsId, text, logo },
                update: { text, logo },
                select
            });
            res.json(settings);
        } catch (error) {
            console.error('Gagal menyimpan pengaturan navbar:', error);
            res.status(500).json({ message: 'Gagal menyimpan pengaturan navbar.' });
        }
    });
}

import { Request, Response } from 'express';
import prisma from '../config/db';

const settingsId = 1;
const select = { text: true, logo: true };

export async function readNavbarSettings() {
    const settings = await prisma.navbarSettings.findUnique({ where: { id: settingsId }, select });
    return settings && { text: settings.text, logo: settings.logo === 'smaip' ? 'smaip' as const : 'smpip' as const };
}

export async function getNavbar(_req: Request, res: Response) {
    try {
        res.json(await readNavbarSettings());
    } catch (error) {
        console.error('Gagal memuat pengaturan navbar:', error);
        res.status(500).json({ message: 'Gagal memuat pengaturan navbar.' });
    }
}

export async function updateNavbar(req: Request, res: Response) {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const logo = req.body?.logo;
    if (!text || text.length > 60) {
        return res.status(400).json({ message: 'Teks navbar harus berisi 1 sampai 60 karakter.' });
    }
    if (logo !== 'smpip' && logo !== 'smaip') {
        return res.status(400).json({ message: 'Pilih logo SMPIP atau SMAIP.' });
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
}

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10); // Password default: admin123

    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: hashedPassword,
            role: 'admin',
            nama: 'Administrator Utama',
        },
    });

    console.log('✅ Akun Admin berhasil dibuat:', admin.username);

    // Identitas sekolah awal untuk instalasi ini. Hanya dibuat bila belum ada, agar perubahan admin tidak tertimpa.
    const logo = process.env.SEKOLAH_LOGO;
    const text = process.env.SEKOLAH_NAMA?.trim();
    if ((logo === 'smpip' || logo === 'smaip') && text && text.length <= 60) {
        await prisma.navbarSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, text, logo } });
        console.log('✅ Identitas sekolah awal:', text, '(' + logo + ')');
    }
}

main()
    .catch((e) => {
        console.error('❌ Gagal seeding admin:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
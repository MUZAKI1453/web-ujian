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
}

main()
    .catch((e) => {
        console.error('❌ Gagal seeding admin:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
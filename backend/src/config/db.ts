import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

prisma.$connect()
    .then(() => {
        console.log('📦 Berhasil terhubung ke database MariaDB via Prisma ORM!');
    })
    .catch((error: any) => {
        console.error('❌ Gagal terhubung ke database:', error);
    });

export default prisma;
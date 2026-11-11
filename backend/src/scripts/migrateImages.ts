import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { hasDataImage, mediaDir, storeQuestionImages } from '../routes/questionImages';

// Memindahkan gambar base64 di soal lama menjadi file di UPLOAD_DIR. Aman dijalankan berulang:
// soal yang gambarnya sudah berupa alamat file dilewati. Jalankan: npm run db:gambar
const prisma = new PrismaClient();

async function main() {
    let last = 0, moved = 0, checked = 0;
    for (;;) {
        // Hanya id yang diambil dulu, supaya isi soal bergambar tidak dimuat sekaligus.
        const ids = await prisma.soal.findMany({ where: { id: { gt: last } }, orderBy: { id: 'asc' }, take: 200, select: { id: true } });
        if (!ids.length) break;
        last = ids[ids.length - 1].id;
        for (const { id } of ids) {
            const question = await prisma.soal.findUnique({ where: { id }, select: { isi: true } });
            checked++;
            if (!question || !hasDataImage(question.isi)) continue;
            const isi = await storeQuestionImages(question.isi);
            await prisma.soal.update({ where: { id }, data: { isi: isi as Prisma.InputJsonObject } });
            moved++;
        }
    }
    console.log(`Selesai. ${checked} soal diperiksa, ${moved} soal dipindahkan gambarnya ke ${mediaDir}.`);
}

main()
    .catch(error => { console.error('Gagal memindahkan gambar:', error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());

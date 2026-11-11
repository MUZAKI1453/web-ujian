import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

// Menyiapkan data uji beban: kelas, mapel, akun siswa, dan satu ujian terbit tanpa token.
// Semua data memakai nama/awalan khusus sehingga bisa dihapus bersih dengan --hapus.
//   node dist/scripts/loadTestSeed.js --siswa 500      (butuh UJI_BEBAN_PASSWORD)
//   node dist/scripts/loadTestSeed.js --hapus
export const LABEL = 'UJI-BEBAN';
export const studentName = (index: number) => 'ub' + String(index).padStart(5, '0');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
    const index = args.indexOf('--' + name);
    const value = index < 0 ? fallback : Number(args[index + 1]);
    if (!Number.isInteger(value) || value < 1) throw new Error(`Nilai --${name} harus bilangan bulat positif.`);
    return value;
};

async function remove() {
    const kelas = await prisma.kelas.findUnique({ where: { namaKelas: LABEL } });
    const mapel = await prisma.mapel.findMany({ where: { nama: LABEL }, select: { id: true } });
    const exams = await prisma.ujian.deleteMany({ where: { mapelId: { in: mapel.map(row => row.id) } } });
    const users = await prisma.user.deleteMany({ where: { role: 'siswa', username: { startsWith: 'ub' }, kelasId: kelas?.id ?? -1 } });
    await prisma.mapel.deleteMany({ where: { id: { in: mapel.map(row => row.id) } } });
    if (kelas) await prisma.kelas.delete({ where: { id: kelas.id } });
    return { exams: exams.count, users: users.count };
}

async function main() {
    const removed = await remove();
    if (args.includes('--hapus')) {
        console.log(`Data uji beban dihapus: ${removed.users} akun, ${removed.exams} ujian.`);
        return;
    }
    const password = process.env.UJI_BEBAN_PASSWORD ?? '';
    if (password.length < 8 || password.startsWith('ub')) throw new Error('Isi UJI_BEBAN_PASSWORD (minimal 8 karakter) untuk akun siswa uji.');
    const students = option('siswa', 100);
    const questions = option('soal', 40);
    const minutes = option('menit', 60);

    const kelas = await prisma.kelas.create({ data: { namaKelas: LABEL } });
    const mapel = await prisma.mapel.create({ data: { nama: LABEL } });
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({ data: Array.from({ length: students }, (_, index) => ({
        username: studentName(index + 1), nama: 'Siswa Uji ' + (index + 1), role: 'siswa' as const, password: hash, kelasId: kelas.id
    })) });

    // 90% pilihan ganda, sisanya isian dan esai. Bobot dibagi rata (total 100).
    const weight = (100 / questions).toFixed(4);
    const filler = 'Teks soal uji beban. '.repeat(8);
    const now = Date.now();
    const exam = await prisma.ujian.create({ data: {
        judul: LABEL, mapelId: mapel.id, kelasId: kelas.id, kelasTujuan: { connect: [{ id: kelas.id }] },
        waktuMulai: new Date(now - 60000), waktuSelesai: new Date(now + (minutes + 60) * 60000), durasiMenit: minutes,
        draf: false, profil: 'latihan-kuis',
        soal: { create: Array.from({ length: questions }, (_, index) => {
            const kind = index % 10 === 8 ? 'ISIAN' : index % 10 === 9 ? 'ESSAY' : 'PG';
            const isi = kind === 'PG'
                ? { gambar: '', items: ['A', 'B', 'C', 'D', 'E'].map((label, option) => ({ teks: 'Opsi ' + label + ' soal ' + (index + 1), benar: option === index % 5, gambar: '' })) }
                : kind === 'ISIAN' ? { gambar: '', jawaban: ['42'], angka: true } : { gambar: '', poinEssay: 10 };
            return { tipeSoal: kind, pertanyaan: `Soal ${index + 1}. ${filler}`, isi, bobot: weight };
        }) }
    } });
    console.log(`Siap: ${students} siswa (${studentName(1)} … ${studentName(students)}), ujian #${exam.id} "${LABEL}" ${questions} soal, durasi ${minutes} menit.`);
    console.log('Selesai menguji? Hapus datanya dengan: npm run uji-beban:hapus');
}

main()
    .catch(error => { console.error('Gagal menyiapkan uji beban:', error.message ?? error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());

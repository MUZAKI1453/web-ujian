import { Request, Response, Router } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import prisma from '../config/db';
import { jwtSecret, requireUser } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import { sortByName } from '../controllers/displayOrder';
import { generateStudentPassword, openPassword, passwordKey, sealPassword } from './studentPassword';

// Kunci enkripsi password siswa. SANDI_SISWA_KEY bersifat opsional; tanpa itu kunci diturunkan dari JWT_SECRET,
// sehingga mengganti JWT_SECRET membuat password lama tidak bisa ditampilkan lagi (login tetap berjalan).
const key = passwordKey(process.env.SANDI_SISWA_KEY?.trim() || jwtSecret);

export const readStudentPassword = (sealed: string | null | undefined) => openPassword(sealed, key);

// Password baru sekaligus mengakhiri sesi yang sedang aktif di akun itu.
export async function newStudentCredentials() {
    const password = generateStudentPassword();
    return { password, data: { password: await bcrypt.hash(password, 10), sandiSiswa: sealPassword(password, key), sesiLogin: randomUUID() } };
}

// classIds membatasi siswa yang boleh disentuh pelaku; undefined berarti semua kelas (admin).
export async function regenerateStudentPassword(siswaId: number, classIds?: number[]) {
    const credentials = await newStudentCredentials();
    const { count } = await prisma.user.updateMany({
        where: { id: siswaId, role: 'siswa', ...(classIds ? { kelasId: { in: classIds } } : {}) }, data: credentials.data
    });
    return count ? credentials.password : null;
}

type Actor = { id: number; username: string; role: 'guru' | 'admin' };

const router = Router();
router.use(requireUser, (_req, res, next) => {
    if (!['guru', 'admin'].includes(res.locals.user.role)) return res.status(403).json({ message: 'Akses khusus guru dan admin.' });
    next();
});

function handle(fn: (req: Request, res: Response, actor: Actor) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try { await fn(req, res, res.locals.user); }
        catch (error) {
            console.error('API akun siswa:', error);
            res.status(500).json({ message: 'Permintaan gagal diproses. Coba lagi.' });
        }
    };
}

const validId = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

// Guru hanya menjangkau kelas yang diajarnya; admin semua kelas.
async function allowedClasses(actor: Actor) {
    if (actor.role === 'admin') return undefined;
    const rows = await prisma.guruMapelKelas.findMany({ where: { guruId: actor.id }, select: { kelasId: true }, distinct: ['kelasId'] });
    return rows.map(row => row.kelasId);
}

const audit = (req: Request, actor: Actor, aksi: string, target: string) =>
    writeAudit(req, { aksi, status: 200, target, pelakuId: actor.id, pelaku: actor.username, peran: actor.role });

router.get('/kelas', handle(async (_req, res, actor) => {
    const ids = await allowedClasses(actor);
    const [classes, totals, missing] = await Promise.all([
        prisma.kelas.findMany({ where: ids ? { id: { in: ids } } : {}, select: { id: true, namaKelas: true }, orderBy: { namaKelas: 'asc' } }),
        prisma.user.groupBy({ by: ['kelasId'], where: { role: 'siswa' }, _count: true }),
        prisma.user.groupBy({ by: ['kelasId'], where: { role: 'siswa', sandiSiswa: null }, _count: true })
    ]);
    const count = (rows: { kelasId: number | null; _count: number }[], id: number) => rows.find(row => row.kelasId === id)?._count ?? 0;
    res.json({ admin: actor.role === 'admin', data: classes.map(item => ({ ...item, jumlah: count(totals, item.id), tanpaSandi: count(missing, item.id) })) });
}));

router.get('/kelas/:kelasId', handle(async (req, res, actor) => {
    const kelasId = Number(req.params.kelasId);
    const ids = await allowedClasses(actor);
    const kelas = validId(kelasId) && (!ids || ids.includes(kelasId))
        ? await prisma.kelas.findUnique({ where: { id: kelasId }, select: { id: true, namaKelas: true } }) : null;
    if (!kelas) return res.status(404).json({ message: 'Kelas tidak ditemukan atau bukan kelas yang Anda ajar.' });
    const students = await prisma.user.findMany({
        where: { role: 'siswa', kelasId }, select: { id: true, username: true, nama: true, sandiSiswa: true }
    });
    audit(req, actor, 'lihat-sandi-siswa', 'kelas ' + kelas.namaKelas + ' (' + students.length + ' siswa)');
    res.json({ kelas, data: sortByName(students, item => item.nama).map(({ sandiSiswa, ...student }) => ({
        ...student, password: readStudentPassword(sandiSiswa), adaSandi: sandiSiswa !== null
    })) });
}));

// Membuat password untuk satu kelas. mode "kosong" hanya untuk siswa yang belum punya; "semua" mengganti seluruhnya.
router.post('/kelas/:kelasId/buat', handle(async (req, res, actor) => {
    const kelasId = Number(req.params.kelasId);
    const mode = req.body?.mode;
    if (actor.role !== 'admin') return res.status(403).json({ message: 'Hanya admin yang dapat membuat password satu kelas sekaligus.' });
    if (!validId(kelasId) || (mode !== 'kosong' && mode !== 'semua')) return res.status(400).json({ message: 'Permintaan tidak valid.' });
    const students = await prisma.user.findMany({
        where: { role: 'siswa', kelasId, ...(mode === 'kosong' ? { sandiSiswa: null } : {}) }, select: { id: true }
    });
    let count = 0;
    // bcrypt memakai empat thread; proses per empat siswa agar server tetap melayani permintaan lain.
    for (let index = 0; index < students.length; index += 4) {
        const results = await Promise.all(students.slice(index, index + 4).map(student => regenerateStudentPassword(student.id)));
        count += results.filter(Boolean).length;
    }
    res.json({ count, message: count ? 'Password dibuat untuk ' + count + ' siswa.' : 'Semua siswa di kelas ini sudah punya password.' });
}));

async function reachableStudent(actor: Actor, siswaId: number) {
    if (!validId(siswaId)) return null;
    const ids = await allowedClasses(actor);
    const student = await prisma.user.findFirst({
        where: { id: siswaId, role: 'siswa', ...(ids ? { kelasId: { in: ids } } : {}) }, select: { id: true, username: true, sandiSiswa: true }
    });
    return student && { student, ids };
}

router.get('/siswa/:id', handle(async (req, res, actor) => {
    const found = await reachableStudent(actor, Number(req.params.id));
    if (!found) return res.status(404).json({ message: 'Siswa tidak ditemukan atau bukan dari kelas yang Anda ajar.' });
    audit(req, actor, 'lihat-sandi-siswa', 'siswa ' + found.student.username);
    res.json({ password: readStudentPassword(found.student.sandiSiswa), adaSandi: found.student.sandiSiswa !== null });
}));

router.post('/siswa/:id', handle(async (req, res, actor) => {
    const found = await reachableStudent(actor, Number(req.params.id));
    const password = found && await regenerateStudentPassword(found.student.id, found.ids);
    if (!password) return res.status(404).json({ message: 'Siswa tidak ditemukan atau bukan dari kelas yang Anda ajar.' });
    res.json({ password, adaSandi: true });
}));

export default router;

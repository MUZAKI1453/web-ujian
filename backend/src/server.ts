import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/db';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import guruRoutes, { collectExpiredAttempts, processCorrectionQueue } from './routes/guruRoutes';
import studentResultsRoutes from './routes/studentResultsRoutes';
import studentExamRoutes from './routes/studentExamRoutes';
import { getNavbar } from './controllers/navbarController';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use('/api/guru', express.json({ limit: '8mb' }), guruRoutes);
app.use('/api/siswa', express.json({ limit: '2mb' }), studentExamRoutes, studentResultsRoutes);
app.use(express.json());
app.get('/api/navbar', getNavbar);

// Daftarkan rute auth
app.use('/api/auth', authRoutes);


// Daftarkan rute admin (INI YANG KURANG SEBELUMNYA)
app.use('/api/admin', adminRoutes); // <-- 2. Daftarkan di sini

// Endpoint Uji Coba & Lainnya...
app.get('/api/test-db', async (req: Request, res: Response) => {
    try {
        const kelasList = await prisma.kelas.findMany();
        res.json({
            status: 'SUCCESS',
            message: 'Koneksi Prisma ke PostgreSQL Berhasil!',
            data: kelasList,
        });
    } catch (error: any) {
        res.status(500).json({
            status: 'ERROR',
            message: 'Gagal mengambil data dari database',
            error: error.message,
        });
    }
});

app.get('/', (req: Request, res: Response) => {
    res.send('API Backend CBT Ujian Online Berjalan Normal 🚀');
});

let processing = false;
const queue = setInterval(async () => {
    if (processing) return;
    processing = true;
    try { await collectExpiredAttempts(); await processCorrectionQueue(); }
    catch (error) { console.error('Antrean penilaian:', error); }
    finally { processing = false; }
}, 3000);
queue.unref();

app.listen(PORT, () => {
    console.log(`🔥 Server berjalan di http://localhost:${PORT}`);
});

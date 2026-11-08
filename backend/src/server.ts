import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import guruRoutes, { collectExpiredAttempts, processCorrectionQueue } from './routes/guruRoutes';
import studentResultsRoutes from './routes/studentResultsRoutes';
import studentExamRoutes from './routes/studentExamRoutes';
import { getNavbar } from './controllers/navbarController';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use(cors());
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
app.use('/api/guru', express.json({ limit: '8mb' }), guruRoutes);
app.use('/api/siswa', express.json({ limit: '2mb' }), studentExamRoutes, studentResultsRoutes);
app.use(express.json());
app.get('/api/navbar', getNavbar);

// Daftarkan rute auth
app.use('/api/auth', authRoutes);


// Daftarkan rute admin (INI YANG KURANG SEBELUMNYA)
app.use('/api/admin', adminRoutes); // <-- 2. Daftarkan di sini

app.get('/', (_req, res) => {
    res.send('API Backend CBT Ujian Online Berjalan Normal 🚀');
});

const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) console.error('API:', error);
    res.status(status).json({ message: status === 500 ? 'Gagal memproses permintaan.' : 'Permintaan tidak valid.' });
};
app.use(handleError);

let processing = false;
const queue = setInterval(async () => {
    if (processing) return;
    processing = true;
    try { await collectExpiredAttempts(); await processCorrectionQueue(); }
    catch (error) { console.error('Antrean penilaian:', error); }
    finally { processing = false; }
}, 3000);
queue.unref();

app.listen(Number(PORT), HOST, () => {
    console.log(`🔥 Server berjalan di http://localhost:${PORT}`);
});

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import guruRoutes, { collectExpiredAttempts, processCorrectionQueue } from './routes/guruRoutes';
import studentResultsRoutes from './routes/studentResultsRoutes';
import studentExamRoutes from './routes/studentExamRoutes';
import { getNavbar, readNavbarSettings } from './controllers/navbarController';
import { requireToken } from './middleware/auth';
import { auditMutations, pruneAudit } from './middleware/audit';
import { mediaDir } from './routes/questionImages';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const frontendIndex = path.join(frontendDist, 'index.html');

app.disable('x-powered-by');
// TRUST_PROXY: jumlah reverse proxy di depan aplikasi (mis. 1 untuk Caddy/Nginx), atau "loopback".
// Kosongkan bila aplikasi diakses langsung, agar alamat IP tidak bisa dipalsukan lewat X-Forwarded-For.
const trustProxy = process.env.TRUST_PROXY?.trim();
app.set('trust proxy', !trustProxy ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

const production = process.env.NODE_ENV === 'production';
const corsOrigins = (process.env.CORS_ORIGIN ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
// Produksi: frontend dan API satu origin, jadi CORS dimatikan kecuali CORS_ORIGIN diisi.
if (corsOrigins.length) app.use(cors({ origin: corsOrigins }));
else if (!production) app.use(cors());

app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        // Gambar soal boleh berupa data URI atau URL https; gaya inline dipakai KaTeX.
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https: http:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
            "script-src 'self'; connect-src 'self'" + (production ? '' : ' http: ws:') + "; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
    next();
});
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
// requireToken menolak permintaan tanpa login sebelum body besar diproses.
app.use('/api/guru', requireToken, auditMutations, express.json({ limit: '8mb' }), guruRoutes);
app.use('/api/siswa', requireToken, express.json({ limit: '2mb' }), studentExamRoutes, studentResultsRoutes);
app.use(express.json());
app.get('/api/navbar', getNavbar);

// Daftarkan rute auth
app.use('/api/auth', authRoutes);

// Daftarkan rute admin
app.use('/api/admin', auditMutations, adminRoutes);

app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'Endpoint API tidak ditemukan.' });
});

// Gambar soal. Nama file adalah hash isinya, jadi aman di-cache selamanya.
app.use('/media', express.static(mediaDir, { immutable: true, maxAge: '1y', index: false, dotfiles: 'ignore' }), (_req, res) => {
    res.sendStatus(404);
});

if (fs.existsSync(frontendIndex)) {
    const assetsDir = path.join(frontendDist, 'assets');
    const workerFile = path.join(frontendDist, 'sw.js');
    if (fs.existsSync(workerFile)) {
        const worker = fs.readFileSync(workerFile, 'utf8');
        // Font .woff/.ttf hanya cadangan untuk browser lama; browser yang mendukung service worker memakai .woff2.
        // Tanpa saringan ini setiap perangkat mengunduh ±800 KB font yang tidak pernah dipakai.
        const assets = fs.readdirSync(assetsDir).filter(name => !/\.(woff|ttf)$/.test(name)).sort()
            .map(name => '/assets/' + encodeURIComponent(name));
        const version = createHash('sha256').update(worker).update(fs.readFileSync(frontendIndex))
            .update(JSON.stringify(assets)).digest('hex').slice(0, 16);
        const script = 'const build = ' + JSON.stringify({ version, assets }) + ';\n' + worker;
        app.get('/sw.js', (_req, res) => {
            res.set('Cache-Control', 'no-cache').type('application/javascript').send(script);
        });
    }
    app.get('/manifest.webmanifest', async (_req, res, next) => {
        try {
            const settings = await readNavbarSettings();
            const logo = settings?.logo ?? 'smpip';
            res.set('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify({
                id: '/', name: settings ? 'Ujian Online ' + settings.text : 'Ujian Online', short_name: 'CBT',
                scope: '/', start_url: '/', display: 'standalone', theme_color: '#1d4ed8', background_color: '#f8fafc',
                icons: [192, 512].map(size => ({
                    src: '/icons/' + logo + '-' + size + '.png', sizes: size + 'x' + size, type: 'image/png'
                }))
            }));
        } catch (error) { next(error); }
    });
    // Ikon layar utama iPhone mengikuti logo sekolah pada instalasi ini (index.html dipakai bersama SMP dan SMA).
    app.get('/apple-touch-icon.png', async (_req, res, next) => {
        try {
            const logo = (await readNavbarSettings())?.logo ?? 'smpip';
            res.set('Cache-Control', 'no-cache').sendFile(path.join(frontendDist, 'icons', logo + '-192.png'));
        } catch (error) { next(error); }
    });
    app.use('/assets', express.static(assetsDir, { immutable: true, maxAge: '1y' }), (_req, res) => {
        res.sendStatus(404);
    });
    app.use(express.static(frontendDist, { index: false }));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.set('Cache-Control', 'no-cache');
        res.sendFile(frontendIndex);
    });
} else {
    app.get('/', (_req, res) => {
        res.send('API Backend CBT Ujian Online Berjalan Normal 🚀');
    });
}

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

const prune = () => { pruneAudit().catch(error => console.error('Pembersihan audit log:', error)); };
setTimeout(prune, 60_000).unref();
setInterval(prune, 86400000).unref();

app.listen(Number(PORT), HOST, () => {
    console.log(`🔥 Server berjalan di http://localhost:${PORT}`);
});

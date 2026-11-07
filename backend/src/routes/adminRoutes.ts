import { Router } from 'express';
import {
    getDashboardStats,

    manageKelas,
    createKelas,
    updateKelas,
    deleteKelas,
    deleteSelectedKelas,

    getSiswa,
    createSiswa,
    updateSiswa,
    deleteSiswa,
    deleteAccounts,

    getGuru,
    createGuru,
    updateGuru,
    deleteGuru,

    getMapel,
    createMapel,
    updateMapel,
    deleteMapel,
    deleteSelectedMapel,

    getGuruMapelKelas,
    assignGuruMapelKelas,
    deleteGuruMapelKelas

} from '../controllers/adminController';
import { uploadExcel } from '../middleware/upload';

import { requireAdmin, requireUser } from '../middleware/auth';
import { downloadTemplate, importUsers } from '../controllers/adminImportController';
import { monitorUjian } from '../controllers/monitoringController';
import { updateNavbar } from '../controllers/navbarController';
import jenisUjianRoutes from './jenisUjianRoutes';

const router = Router();
router.use(requireUser, requireAdmin);
router.use('/jenis-ujian', jenisUjianRoutes);
router.get('/ujian', monitorUjian);

// Dashboard
router.get('/dashboard', getDashboardStats);
router.put('/navbar', updateNavbar);

// Kelas (CRUD Manual)
router.get('/kelas', manageKelas);
router.post('/kelas', createKelas);
router.put('/kelas/:id', updateKelas);
router.post('/kelas/hapus-terpilih', deleteSelectedKelas);
router.delete('/kelas/:id', deleteKelas);

// Siswa (CRUD Manual, Template & Import Excel)
router.get('/siswa/template', downloadTemplate('siswa'));
router.post('/siswa/import', uploadExcel.single('file'), importUsers('siswa'));
router.get('/siswa', getSiswa);
router.post('/siswa', createSiswa);
router.put('/siswa/:id', updateSiswa);
router.post('/siswa/hapus-terpilih', deleteAccounts('siswa'));
router.delete('/siswa/:id', deleteSiswa);

// Guru (CRUD Manual)
router.get('/guru/template', downloadTemplate('guru'));
router.post('/guru/import', uploadExcel.single('file_excel'), importUsers('guru'));
router.get('/guru', getGuru);
router.post('/guru', createGuru);
router.put('/guru/:id', updateGuru);
router.post('/guru/hapus-terpilih', deleteAccounts('guru'));
router.delete('/guru/:id', deleteGuru);

// Mata Pelajaran (CRUD)
router.get('/mapel', getMapel);
router.post('/mapel', createMapel);
router.put('/mapel/:id', updateMapel);
router.post('/mapel/hapus-terpilih', deleteSelectedMapel);
router.delete('/mapel/:id', deleteMapel);

// Penugasan Mengajar (Guru - Mapel - Kelas)
router.get('/penugasan', getGuruMapelKelas);
router.post('/penugasan', assignGuruMapelKelas);
router.delete('/penugasan/:id', deleteGuruMapelKelas);

export default router;

import { Router } from 'express';
import {
    getDashboardStats,

    manageKelas,
    createKelas,
    updateKelas,
    deleteKelas,

    getSiswa,
    createSiswa,
    updateSiswa,
    deleteSiswa,

    getGuru,
    createGuru,
    updateGuru,
    deleteGuru,

    getMapel,
    createMapel,
    updateMapel,
    deleteMapel,

    // Tambahkan impor fungsi penugasan di sini
    getGuruMapelKelas,
    assignGuruMapelKelas,
    deleteGuruMapelKelas

} from '../controllers/adminController';
import { uploadExcel } from '../middleware/upload'; // Jika diperlukan untuk fitur import

const router = Router();

// Dashboard
router.get('/dashboard', getDashboardStats);

// Kelas (CRUD Manual)
router.get('/kelas', manageKelas);
router.post('/kelas', createKelas);
router.put('/kelas/:id', updateKelas);
router.delete('/kelas/:id', deleteKelas);

// Siswa (CRUD Manual)
router.get('/siswa', getSiswa);
router.post('/siswa', createSiswa);
router.put('/siswa/:id', updateSiswa);
router.delete('/siswa/:id', deleteSiswa);

// Guru (CRUD Manual)
router.get('/guru', getGuru);
router.post('/guru', createGuru);
router.put('/guru/:id', updateGuru);
router.delete('/guru/:id', deleteGuru);

// Mata Pelajaran (CRUD)
router.get('/mapel', getMapel);
router.post('/mapel', createMapel);
router.put('/mapel/:id', updateMapel);
router.delete('/mapel/:id', deleteMapel);

// Penugasan Mengajar (Guru - Mapel - Kelas)
router.get('/penugasan', getGuruMapelKelas);
router.post('/penugasan', assignGuruMapelKelas);
router.delete('/penugasan/:id', deleteGuruMapelKelas);

export default router;
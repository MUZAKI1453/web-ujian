import ModalOverlay from '../../components/ModalOverlay';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import AlertDialog from '../../components/AlertDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { downloadImportTemplate } from '../../services/downloadImportTemplate';
import { Users, Plus, Edit3, Trash2, Search, UploadCloud, School, ChevronDown, Download, FileText, CheckCircle2 } from 'lucide-react';

interface Kelas {
    id: number;
    namaKelas: string;
}

interface Siswa {
    id: number;
    username: string; // NIS
    nama: string;
    kelas?: Kelas | null;
}

export default function DataSiswa() {
    const [siswaList, setSiswaList] = useState<Siswa[]>([]);
    const [kelasList, setKelasList] = useState<Kelas[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedKelasFilter, setSelectedKelasFilter] = useState('');

    // State Modal Form (Tambah / Edit)
    const [deleteIds, setDeleteIds] = useState<number[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [username, setUsername] = useState('');
    const [nama, setNama] = useState('');
    const [kelasId, setKelasId] = useState('');

    // State Modal Import Excel
    const [showImportModal, setShowImportModal] = useState(false);
    const [fileExcel, setFileExcel] = useState<File | null>(null);

    // State untuk memicu Dialog Sukses atau Error
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
            api.get('/admin/siswa'),
            api.get('/admin/kelas')
        ])
            .then(([resSiswa, resKelas]) => {
                if (resSiswa.data.status === 'SUCCESS') setSiswaList(resSiswa.data.data);
                if (resKelas.data.status === 'SUCCESS') setKelasList(resKelas.data.data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Gagal memuat data siswa:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenAdd = () => {
        setIsEdit(false);
        setSelectedId(null);
        setUsername('');
        setNama('');
        setKelasId('');
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleOpenEdit = (siswa: Siswa) => {
        setIsEdit(true);
        setSelectedId(siswa.id);
        setUsername(siswa.username);
        setNama(siswa.nama);
        setKelasId(siswa.kelas ? String(siswa.kelas.id) : '');
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!kelasId) {
            setErrorMessage('Kelas siswa wajib dipilih!');
            return;
        }

        const payload = {
            username,
            nama,
            kelasId: Number(kelasId)
        };

        if (isEdit && selectedId !== null) {
            api.put(`/admin/siswa/${selectedId}`, payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                    setSuccessMessage('Data siswa berhasil diperbarui.');
                })
                .catch((err) => setErrorMessage(err.response?.data?.message || 'Gagal memperbarui siswa'));
        } else {
            api.post('/admin/siswa', payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                    setSuccessMessage('Data siswa baru berhasil ditambahkan.');
                })
                .catch((err) => setErrorMessage(err.response?.data?.message || 'Gagal menambah siswa'));
        }
    };

    const handleImportSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileExcel) {
            setErrorMessage('Pilih file Excel terlebih dahulu!');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileExcel);

        api.post('/admin/siswa/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
            .then((res) => {
                setShowImportModal(false);
                setFileExcel(null);
                fetchData();
                setSuccessMessage(res.data.message || 'Import data siswa berhasil!');
            })
            .catch((err) => setErrorMessage(err.response?.data?.message || 'Gagal mengimport file Excel'));
    };

    const filteredSiswa = siswaList.filter((s) => {
        const matchesSearch =
            s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.username.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesKelas = selectedKelasFilter === '' || (s.kelas && String(s.kelas.id) === selectedKelasFilter);

        return matchesSearch && matchesKelas;
    });

    const visibleIds = filteredSiswa.map(item => item.id);
    const visibleSelected = visibleIds.filter(id => selectedIds.includes(id));
    const allSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto relative">
            {/* Header Utama & Kontrol */}
            <div className="ui-card bg-white p-5 sm:p-8 border flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="ui-page-title flex items-center gap-2.5">
                        <Users className="text-blue-600" size={28} /> Kelola Data Siswa
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Daftar akun peserta didik/siswa aktif beserta penempatan kelas di portal CBT SMPIP Baitussalam.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <div className="flex items-center w-full sm:w-80 bg-slate-50 hover:bg-slate-100/65 focus-within:bg-white focus-within:border-blue-600 border border-slate-200 rounded-2xl transition overflow-hidden">
                        <div className="flex items-center pl-3.5 text-slate-400 shrink-0">
                            <Search size={18} />
                        </div>
                        <input
                            type="text"
                            placeholder="Cari nama atau NIS..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ui-input w-full bg-transparent"
                        />
                        <div className="relative border-l border-slate-200 bg-slate-100/60 hover:bg-slate-200/50 transition">
                            <select
                                value={selectedKelasFilter}
                                onChange={(e) => setSelectedKelasFilter(e.target.value)}
                                className="ui-input w-full pl-3 pr-8 bg-transparent text-xs font-semibold appearance-none cursor-pointer"
                            >
                                <option value="">Semua Kelas</option>
                                {kelasList.map((k) => (
                                    <option key={k.id} value={k.id}>
                                        {k.namaKelas}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="ui-button ui-button-success flex-1 sm:flex-none flex items-center justify-center gap-2 shadow-emerald-600/25 shrink-0 h-[42px]"
                        >
                            <UploadCloud size={18} /> <span>Import</span>
                        </button>
                        <button
                            onClick={handleOpenAdd}
                            className="ui-button ui-button-primary flex-1 sm:flex-none flex items-center justify-center gap-2 shadow-blue-600/25 shrink-0 h-[42px]"
                        >
                            <Plus size={18} /> <span>Tambah Siswa</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabel Data Siswa */}
            <div className="ui-card bg-white border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="ui-table w-full text-left border-collapse">
                        <thead>
                        <tr>
                            <td colSpan={6} className="px-6 py-3">
                                <button type="button" disabled={!visibleSelected.length}
                                        onClick={() => setDeleteIds(visibleSelected)}
                                        className="ui-button ui-button-danger">
                                    Hapus terpilih ({visibleSelected.length})
                                </button>
                            </td>
                        </tr>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-slate-100">
                            <th className="pl-6">
                                <input type="checkbox" aria-label="Pilih semua yang ditampilkan"
                                       checked={allSelected} disabled={!visibleIds.length}
                                       onChange={() => setSelectedIds(allSelected ? [] : visibleIds)} />
                            </th>
                            <th className="py-4 px-6">No</th>
                            <th className="py-4 px-6">NIS / Username</th>
                            <th className="py-4 px-6">Nama Lengkap Siswa</th>
                            <th className="py-4 px-6">Kelas</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-slate-400 animate-pulse">Memuat data siswa...</td>
                            </tr>
                        ) : filteredSiswa.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-slate-400">Belum ada data siswa ditemukan.</td>
                            </tr>
                        ) : (
                            filteredSiswa.map((item, index) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="pl-6">
                                        <input type="checkbox" aria-label={'Pilih ' + item.nama}
                                               checked={selectedIds.includes(item.id)}
                                               onChange={event => {
                                                   const checked = event.target.checked;
                                                   setSelectedIds(ids => checked ? [...ids, item.id] : ids.filter(id => id !== item.id));
                                               }} />
                                    </td>
                                    <td className="py-4 px-6 font-medium text-slate-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-mono font-semibold text-slate-600">{item.username}</td>
                                    <td className="py-4 px-6 font-bold text-slate-800">{item.nama}</td>
                                    <td className="py-4 px-6">
                                        {item.kelas ? (
                                            <span className="ui-badge inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700">
                                                <School size={14} /> {item.kelas.namaKelas}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Belum ada kelas</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="ui-button ui-button-soft ui-icon-button"
                                                title="Edit Siswa"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="ui-button ui-button-danger-soft ui-icon-button"
                                                title="Hapus Siswa"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Dialog Konfirmasi Hapus */}
            {deleteIds.length > 0 && (
                <DeleteAccountDialog
                    role="siswa"
                    ids={deleteIds}
                    onClose={() => setDeleteIds([])}
                    onDeleted={() => {
                        setSelectedIds([]);
                        fetchData();
                        setSuccessMessage('Data siswa berhasil dihapus.');
                    }}
                />
            )}

            {/* Dialog Notifikasi Sukses */}
            {successMessage && (
                <SuccessDialog
                    title="Berhasil!"
                    message={successMessage}
                    onClose={() => setSuccessMessage(null)}
                />
            )}

            {/* Modal Tambah / Edit Siswa */}
            {showModal && (
                <ModalOverlay>
                    <div className="ui-dialog-panel max-w-md space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">
                            {isEdit ? 'Edit Data Siswa' : 'Tambah Data Siswa Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="ui-label block mb-1">NIS / Username (Angka Saja)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    required
                                    placeholder="Contoh: 12345"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/\D/g, ''))}
                                    className="ui-input w-full border focus:border-blue-600 font-mono"
                                />
                            </div>
                            <div>
                                <label className="ui-label block mb-1">Nama Lengkap Siswa</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Ahmad Fauzi"
                                    value={nama}
                                    onChange={(e) => setNama(e.target.value)}
                                    className="ui-input w-full border focus:border-blue-600"
                                />
                            </div>
                            <div>
                                <label className="ui-label block mb-1">Pilih Kelas</label>
                                <select
                                    required
                                    value={kelasId}
                                    onChange={(e) => setKelasId(e.target.value)}
                                    className="ui-input w-full border focus:border-blue-600"
                                >
                                    <option value="">-- Pilih Kelas --</option>
                                    {kelasList.map((k) => (
                                        <option key={k.id} value={k.id}>
                                            {k.namaKelas}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="ui-button ui-button-secondary"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="ui-button ui-button-primary"
                                >
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Siswa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalOverlay>
            )}

            {/* Modal Import Excel Siswa dengan Panduan & Tombol Download Template */}
            {showImportModal && (
                <ModalOverlay>
                    <div className="ui-dialog-panel max-w-lg space-y-5">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="text-emerald-600" size={22} /> Import Data Siswa via Excel
                            </h3>
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Kotak Panduan Ringkas */}
                        <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-2xl space-y-2 text-xs text-emerald-900">
                            <p className="font-bold flex items-center gap-1.5 text-emerald-800 text-sm">
                                <CheckCircle2 size={16} className="text-emerald-600" /> Panduan Singkat Import:
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                <li className="font-medium text-emerald-950">Download file template Excel resmi terlebih dahulu melalui tombol di bawah.</li>
                                <li>Pertahankan judul kolom di baris 11. Ganti contoh dengan NIS, nama lengkap, dan nama kelas mulai baris 12.</li>
                                <li>Isi NIS sebagai teks agar nol di depan tetap tersimpan. Gunakan nama kelas yang sudah terdaftar.</li>
                            </ul>
                        </div>

                        {/* Tombol Download Template */}
                        <div>
                            <button
                                type="button"
                                onClick={() => void downloadImportTemplate('siswa')}
                                className="ui-button ui-button-secondary w-full flex items-center justify-center gap-2 border"
                            >
                                <Download size={16} className="text-blue-600" /> Unduh Template Siswa
                            </button>
                        </div>

                        <form onSubmit={handleImportSubmit} className="space-y-4 pt-2 border-t border-slate-100">
                            <div>
                                <label className="ui-label block mb-1.5">Pilih File Excel yang Diisi (.xlsx / .xls)</label>
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    required
                                    onChange={(e) => setFileExcel(e.target.files ? e.target.files[0] : null)}
                                    className="ui-input w-full text-xs file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowImportModal(false)}
                                    className="ui-button ui-button-secondary"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="ui-button ui-button-success"
                                >
                                    Mulai Import Data
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalOverlay>
            )}

            {/* AlertDialog dipindahkan keluar dari struktur utama atau pastikan posisinya merender secara global (portal) jika diperlukan */}
            {errorMessage && (
                <AlertDialog
                    title="Perhatian"
                    message={errorMessage}
                    onClose={() => setErrorMessage(null)}
                />
            )}
        </div>
    );
}
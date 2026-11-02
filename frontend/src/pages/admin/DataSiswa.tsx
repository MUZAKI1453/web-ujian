import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, Plus, Edit3, Trash2, Search, UploadCloud, School, ChevronDown } from 'lucide-react';

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
    const [selectedKelasFilter, setSelectedKelasFilter] = useState(''); // State untuk filter kelas

    // State Modal Form (Tambah / Edit)
    const [showModal, setShowModal] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [username, setUsername] = useState(''); // NIS (Angka saja)
    const [nama, setNama] = useState('');
    const [kelasId, setKelasId] = useState('');

    // State Modal Import Excel
    const [showImportModal, setShowImportModal] = useState(false);
    const [fileExcel, setFileExcel] = useState<File | null>(null);

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
        setShowModal(true);
    };

    const handleOpenEdit = (siswa: Siswa) => {
        setIsEdit(true);
        setSelectedId(siswa.id);
        setUsername(siswa.username);
        setNama(siswa.nama);
        setKelasId(siswa.kelas ? String(siswa.kelas.id) : '');
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!kelasId) {
            alert('Kelas siswa wajib dipilih!');
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
                })
                .catch((err) => alert(err.response?.data?.message || 'Gagal memperbarui siswa'));
        } else {
            api.post('/admin/siswa', payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                })
                .catch((err) => alert(err.response?.data?.message || 'Gagal menambah siswa'));
        }
    };

    const handleDelete = (id: number) => {
        if (confirm('Yakin ingin menghapus data siswa ini?')) {
            api.delete(`/admin/siswa/${id}`)
                .then(() => fetchData())
                .catch(() => alert('Gagal menghapus siswa'));
        }
    };

    const handleImportSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileExcel) {
            alert('Pilih file Excel terlebih dahulu!');
            return;
        }

        const formData = new FormData();
        formData.append('file_excel', fileExcel);

        api.post('/admin/siswa/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
            .then((res) => {
                alert(res.data.message || 'Import siswa berhasil!');
                setShowImportModal(false);
                setFileExcel(null);
                fetchData();
            })
            .catch((err) => alert(err.response?.data?.message || 'Gagal mengimport file Excel'));
    };

    // Logika Filter & Pencarian
    const filteredSiswa = siswaList.filter((s) => {
        const matchesSearch =
            s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.username.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesKelas = selectedKelasFilter === '' || (s.kelas && String(s.kelas.id) === selectedKelasFilter);

        return matchesSearch && matchesKelas;
    });

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header Utama & Kontrol */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2.5">
                        <Users className="text-blue-600" size={28} /> Kelola Data Siswa
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Daftar akun peserta didik/siswa aktif beserta penempatan kelas di portal CBT SMPIP Baitussalam.
                    </p>
                </div>

                {/* Kontrol Pencarian Terpadu (Search + Filter Kelas) & Tombol Aksi */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">

                    {/* Kotak Gabungan Search & Filter Kelas */}
                    <div className="flex items-center w-full sm:w-80 bg-slate-50 hover:bg-slate-100/65 focus-within:bg-white focus-within:border-blue-600 border border-gray-200 rounded-2xl transition overflow-hidden">
                        <div className="flex items-center pl-3.5 text-gray-400 shrink-0">
                            <Search size={18} />
                        </div>
                        <input
                            type="text"
                            placeholder="Cari nama atau NIS..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-2.5 bg-transparent focus:outline-none text-sm text-gray-700"
                        />
                        <div className="relative border-l border-gray-200 bg-slate-100/60 hover:bg-slate-200/50 transition">
                            <select
                                value={selectedKelasFilter}
                                onChange={(e) => setSelectedKelasFilter(e.target.value)}
                                className="w-full pl-3 pr-8 py-2.5 bg-transparent focus:outline-none text-xs font-semibold text-gray-600 appearance-none cursor-pointer"
                            >
                                <option value="">Semua Kelas</option>
                                {kelasList.map((k) => (
                                    <option key={k.id} value={k.id}>
                                        {k.namaKelas}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Tombol Aksi dengan ukuran tetap (Fixed Size & Shrink-0) */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl font-semibold shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 text-sm"
                        >
                            <UploadCloud size={18} /> Import
                        </button>
                        <button
                            onClick={handleOpenAdd}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl font-semibold shadow-md shadow-blue-600/20 transition-all hover:-translate-y-0.5 text-sm"
                        >
                            <Plus size={18} /> Tambah Siswa
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabel Data Siswa */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
                            <th className="py-4 px-6">No</th>
                            <th className="py-4 px-6">NIS / Username</th>
                            <th className="py-4 px-6">Nama Lengkap Siswa</th>
                            <th className="py-4 px-6">Kelas</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400 animate-pulse">Memuat data siswa...</td>
                            </tr>
                        ) : filteredSiswa.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">Belum ada data siswa ditemukan.</td>
                            </tr>
                        ) : (
                            filteredSiswa.map((item, index) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-4 px-6 font-medium text-gray-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-mono font-semibold text-gray-600">{item.username}</td>
                                    <td className="py-4 px-6 font-bold text-gray-800">{item.nama}</td>
                                    <td className="py-4 px-6">
                                        {item.kelas ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">
                                                <School size={14} /> {item.kelas.namaKelas}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Belum ada kelas</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-colors"
                                                title="Edit Siswa"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
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

            {/* Modal Tambah / Edit Siswa */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">
                            {isEdit ? 'Edit Data Siswa' : 'Tambah Data Siswa Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">NIS / Username (Angka Saja)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    required
                                    placeholder="Contoh: 12345"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nama Lengkap Siswa</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Ahmad Fauzi"
                                    value={nama}
                                    onChange={(e) => setNama(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Pilih Kelas</label>
                                <select
                                    required
                                    value={kelasId}
                                    onChange={(e) => setKelasId(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm bg-white"
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
                                    className="px-4 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100 font-semibold text-sm transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md transition"
                                >
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Siswa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Import Excel Siswa */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">Import Data Siswa via Excel</h3>
                        <form onSubmit={handleImportSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Pilih File Excel (.xlsx / .xls)</label>
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    required
                                    onChange={(e) => setFileExcel(e.target.files ? e.target.files[0] : null)}
                                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                                />
                                <p className="text-xs text-gray-400 mt-1.5">Format kolom Excel harus memiliki header: <b>NIS</b> dan <b>Nama</b>.</p>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowImportModal(false)}
                                    className="px-4 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100 font-semibold text-sm transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md transition"
                                >
                                    Mulai Import
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
import ModalOverlay from '../../components/ModalOverlay';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Plus, Trash2, Edit3, Layers, Search, Users } from 'lucide-react';

interface Kelas {
    id: number;
    namaKelas: string;
    _count?: {
        users: number;
    };
}

export default function DataKelas() {
    const [kelasList, setKelasList] = useState<Kelas[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State untuk Modal (Tambah / Edit & Hapus)
    const [showModal, setShowModal] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [namaKelas, setNamaKelas] = useState('');

    // State untuk fitur hapus & checkbox massal
    const [deleteIds, setDeleteIds] = useState<number[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // State untuk memicu Dialog Sukses (Bisa dipakai untuk Tambah, Edit, maupun Hapus)
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchKelas = () => {
        setLoading(true);
        api.get('/admin/kelas')
            .then((res) => {
                if (res.data.status === 'SUCCESS') {
                    setKelasList(res.data.data);
                }
                setLoading(false);
            })
            .catch((err) => {
                console.error('Gagal memuat data kelas:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchKelas();
    }, []);

    const handleOpenAdd = () => {
        setIsEdit(false);
        setSelectedId(null);
        setNamaKelas('');
        setShowModal(true);
    };

    const handleOpenEdit = (item: Kelas) => {
        setIsEdit(true);
        setSelectedId(item.id);
        setNamaKelas(item.namaKelas);
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isEdit && selectedId !== null) {
            api.put(`/admin/kelas/${selectedId}`, { namaKelas })
                .then(() => {
                    setShowModal(false);
                    setNamaKelas('');
                    fetchKelas();
                    // Munculkan pop-up sukses edit
                    setSuccessMessage('Data kelas berhasil diperbarui.');
                })
                .catch((err) => {
                    alert(err.response?.data?.message || 'Gagal memperbarui kelas');
                });
        } else {
            api.post('/admin/kelas', { namaKelas })
                .then(() => {
                    setShowModal(false);
                    setNamaKelas('');
                    fetchKelas();
                    // Munculkan pop-up sukses tambah
                    setSuccessMessage('Data kelas baru berhasil ditambahkan.');
                })
                .catch((err) => {
                    alert(err.response?.data?.message || 'Gagal menambah kelas');
                });
        }
    };

    const filteredKelas = kelasList.filter((k) =>
        k.namaKelas.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const visibleIds = filteredKelas.map(item => item.id);
    const visibleSelected = visibleIds.filter(id => selectedIds.includes(id));
    const allSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header Utama & Kontrol */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2.5">
                        <Layers className="text-blue-600" size={28} /> Kelola Data Kelas
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Daftar seluruh nama kelas aktif di portal CBT SMPIP Baitussalam.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                    <div className="relative flex items-center w-full md:w-72">
                        <Search size={18} className="absolute left-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cari nama kelas..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-gray-200 focus:border-blue-600 rounded-2xl focus:outline-none text-sm text-gray-700 transition"
                        />
                    </div>
                    <button
                        onClick={handleOpenAdd}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-semibold shadow-md shadow-blue-600/20 transition-all hover:-translate-y-0.5 text-sm shrink-0"
                    >
                        <Plus size={18} /> Tambah Kelas
                    </button>
                </div>
            </div>

            {/* Tabel Data Kelas */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr>
                            <td colSpan={5} className="px-6 py-3">
                                <button type="button" disabled={!visibleSelected.length}
                                        onClick={() => setDeleteIds(visibleSelected)}
                                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                                    Hapus terpilih ({visibleSelected.length})
                                </button>
                            </td>
                        </tr>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
                            <th className="pl-6 w-12">
                                <input type="checkbox" aria-label="Pilih semua yang ditampilkan"
                                       checked={allSelected} disabled={!visibleIds.length}
                                       onChange={() => setSelectedIds(allSelected ? [] : visibleIds)} />
                            </th>
                            <th className="py-4 px-6">No</th>
                            <th className="py-4 px-6">Nama Kelas</th>
                            <th className="py-4 px-6">Jumlah Siswa</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400 animate-pulse">Memuat data kelas...</td>
                            </tr>
                        ) : filteredKelas.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">Belum ada data kelas ditemukan.</td>
                            </tr>
                        ) : (
                            filteredKelas.map((item, index) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="pl-6">
                                        <input type="checkbox" aria-label={'Pilih ' + item.namaKelas}
                                               checked={selectedIds.includes(item.id)}
                                               onChange={event => {
                                                   const checked = event.target.checked;
                                                   setSelectedIds(ids => checked ? [...ids, item.id] : ids.filter(id => id !== item.id));
                                               }} />
                                    </td>
                                    <td className="py-4 px-6 font-medium text-gray-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-bold text-gray-800">{item.namaKelas}
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">
                                            <Users size={14} /> {item._count?.users ?? 0} Siswa
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-colors"
                                                title="Edit Kelas"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                                                title="Hapus Kelas"
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
                    role="kelas"
                    ids={deleteIds}
                    onClose={() => setDeleteIds([])}
                    onDeleted={() => {
                        setSelectedIds([]);
                        fetchKelas();
                        setSuccessMessage('Data kelas berhasil dihapus.');
                    }}
                />
            )}

            {/* Dialog Notifikasi Sukses (Untuk Tambah, Edit, & Hapus) */}
            {successMessage && (
                <SuccessDialog
                    title="Berhasil!"
                    message={successMessage}
                    onClose={() => setSuccessMessage(null)}
                />
            )}

            {/* Modal Tambah / Edit Kelas */}
            {showModal && (
                <ModalOverlay>
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">
                            {isEdit ? 'Edit Data Kelas' : 'Tambah Data Kelas Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nama Kelas</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: 7A"
                                    value={namaKelas}
                                    onChange={(e) => setNamaKelas(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm"
                                />
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
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Kelas'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
}
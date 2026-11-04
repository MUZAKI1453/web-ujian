import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { BookOpen, Plus, Edit3, Trash2, Search, GraduationCap } from 'lucide-react';

interface Guru {
    id: number;
    nama: string;
}

interface Mapel {
    id: number;
    nama: string;
    pengampu: { id: number; guru: Guru; kelas: { namaKelas: string } }[];
}

export default function DataMapel() {
    const [mapelList, setMapelList] = useState<Mapel[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State untuk Modal (Tambah / Edit)
    const [showModal, setShowModal] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [nama, setNama] = useState('');

    // State untuk fitur hapus & checkbox massal
    const [deleteIds, setDeleteIds] = useState<number[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // State untuk memicu Dialog Sukses
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchMapel = () => {
        setLoading(true);
        api.get('/admin/mapel')
            .then((res) => {
                if (res.data.status === 'SUCCESS') {
                    setMapelList(res.data.data);
                }
                setLoading(false);
            })
            .catch((err) => {
                console.error('Gagal memuat mata pelajaran:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchMapel();
    }, []);

    const handleOpenAdd = () => {
        setIsEdit(false);
        setSelectedId(null);
        setNama('');
        setShowModal(true);
    };

    const handleOpenEdit = (item: Mapel) => {
        setIsEdit(true);
        setSelectedId(item.id);
        setNama(item.nama);
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = { nama };

        if (isEdit && selectedId !== null) {
            api.put(`/admin/mapel/${selectedId}`, payload)
                .then(() => {
                    setShowModal(false);
                    fetchMapel();
                    setSuccessMessage('Mata pelajaran berhasil diperbarui.');
                })
                .catch((err) => alert(err.response?.data?.message || 'Gagal memperbarui mata pelajaran'));
        } else {
            api.post('/admin/mapel', payload)
                .then(() => {
                    setShowModal(false);
                    fetchMapel();
                    setSuccessMessage('Mata pelajaran baru berhasil ditambahkan.');
                })
                .catch((err) => alert(err.response?.data?.message || 'Gagal menambah mata pelajaran'));
        }
    };

    const filteredMapel = mapelList.filter((m) =>
        m.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.pengampu.some(p => p.guru.nama?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const visibleIds = filteredMapel.map(item => item.id);
    const visibleSelected = visibleIds.filter(id => selectedIds.includes(id));
    const allSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header Utama & Kontrol */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2.5">
                        <BookOpen className="text-blue-600" size={28} /> Kelola Mata Pelajaran
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Daftar mata pelajaran beserta guru pengampu di portal CBT SMPIP Baitussalam.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="relative flex items-center w-full sm:w-72">
                        <Search size={18} className="absolute left-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cari mapel atau guru..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-gray-200 focus:border-blue-600 rounded-2xl focus:outline-none text-sm text-gray-700 transition"
                        />
                    </div>
                    <button
                        onClick={handleOpenAdd}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-semibold shadow-md shadow-blue-600/20 transition-all hover:-translate-y-0.5 text-sm shrink-0"
                    >
                        <Plus size={18} /> Tambah Mapel
                    </button>
                </div>
            </div>

            {/* Tabel Data Mapel */}
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
                            <th className="py-4 px-6">Nama Mata Pelajaran</th>
                            <th className="py-4 px-6">Guru Pengampu</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400 animate-pulse">Memuat mata pelajaran...</td>
                            </tr>
                        ) : filteredMapel.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">Belum ada mata pelajaran ditemukan.</td>
                            </tr>
                        ) : (
                            filteredMapel.map((item, index) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="pl-6">
                                        <input type="checkbox" aria-label={'Pilih ' + item.nama}
                                               checked={selectedIds.includes(item.id)}
                                               onChange={event => {
                                                   const checked = event.target.checked;
                                                   setSelectedIds(ids => checked ? [...ids, item.id] : ids.filter(id => id !== item.id));
                                               }} />
                                    </td>
                                    <td className="py-4 px-6 font-medium text-gray-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-bold text-gray-800">{item.nama}</td>
                                    <td className="py-4 px-6">
                                        {item.pengampu.length ? item.pengampu.map(p => (
                                            <span key={p.id} className="m-0.5 inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full">
                                                <GraduationCap size={14} /> {p.guru.nama} · {p.kelas.namaKelas}
                                            </span>
                                        )) : (<span className="text-xs text-gray-400 italic">Belum ditentukan</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-colors"
                                                title="Edit Mapel"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                                                title="Hapus Mapel"
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

            {/* Dialog Konfirmasi Hapus Menggunakan DeleteAccountDialog */}
            {deleteIds.length > 0 && (
                <DeleteAccountDialog
                    role="mapel"
                    ids={deleteIds}
                    onClose={() => setDeleteIds([])}
                    onDeleted={() => {
                        setSelectedIds([]);
                        fetchMapel();
                        setSuccessMessage('Mata pelajaran berhasil dihapus.');
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

            {/* Modal Tambah / Edit Mapel */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">
                            {isEdit ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nama Mata Pelajaran</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Matematika, Bahasa Indonesia"
                                    value={nama}
                                    onChange={(e) => setNama(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm"
                                />
                            </div>
                            <p className="text-xs text-slate-600">Atur guru pengampu beserta kelasnya melalui Data Guru.</p>
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
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Mapel'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
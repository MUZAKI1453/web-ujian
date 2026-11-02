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
    guruId?: number;
    guru?: Guru | null;
}

export default function DataMapel() {
    const [mapelList, setMapelList] = useState<Mapel[]>([]);
    const [guruList, setGuruList] = useState<Guru[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State untuk Modal (Tambah / Edit)
    const [showModal, setShowModal] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [nama, setNama] = useState('');
    const [guruId, setGuruId] = useState(''); // State untuk pilihan guru pengampu

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

    const fetchGuru = () => {
        api.get('/admin/guru')
            .then((res) => {
                if (res.data.status === 'SUCCESS') {
                    setGuruList(res.data.data);
                }
            })
            .catch((err) => console.error('Gagal memuat data guru:', err));
    };

    useEffect(() => {
        fetchMapel();
        fetchGuru();
    }, []);

    const handleOpenAdd = () => {
        setIsEdit(false);
        setSelectedId(null);
        setNama('');
        setGuruId('');
        setShowModal(true);
    };

    const handleOpenEdit = (item: Mapel) => {
        setIsEdit(true);
        setSelectedId(item.id);
        setNama(item.nama);
        setGuruId(item.guruId ? String(item.guruId) : '');
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            nama,
            guruId: guruId ? Number(guruId) : null
        };

        if (isEdit && selectedId !== null) {
            api.put(`/admin/mapel/${selectedId}`, payload)
                .then(() => {
                    setShowModal(false);
                    fetchMapel();
                })
                .catch((err) => alert(err.response?.data?.message || 'Gagal memperbarui mata pelajaran'));
        } else {
            api.post('/admin/mapel', payload)
                .then(() => {
                    setShowModal(false);
                    fetchMapel();
                })
                .catch((err) => alert(err.response?.data?.message || 'Gagal menambah mata pelajaran'));
        }
    };

    const handleDelete = (id: number) => {
        if (confirm('Yakin ingin menghapus mata pelajaran ini?')) {
            api.delete(`/admin/mapel/${id}`)
                .then(() => fetchMapel())
                .catch((err) => alert(err.response?.data?.message || 'Gagal menghapus mata pelajaran'));
        }
    };

    const filteredMapel = mapelList.filter((m) =>
        m.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.guru?.nama && m.guru.nama.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
                            <th className="py-4 px-6">No</th>
                            <th className="py-4 px-6">Nama Mata Pelajaran</th>
                            <th className="py-4 px-6">Guru Pengampu</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="text-center py-12 text-gray-400 animate-pulse">Memuat mata pelajaran...</td>
                            </tr>
                        ) : filteredMapel.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center py-12 text-gray-400">Belum ada mata pelajaran ditemukan.</td>
                            </tr>
                        ) : (
                            filteredMapel.map((item, index) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-4 px-6 font-medium text-gray-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-bold text-gray-800">{item.nama}</td>
                                    <td className="py-4 px-6">
                                        {item.guru ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full">
                                                <GraduationCap size={14} /> {item.guru.nama}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Belum ditentukan</span>
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
                                                onClick={() => handleDelete(item.id)}
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
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Guru Pengampu</label>
                                <select
                                    value={guruId}
                                    onChange={(e) => setGuruId(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm bg-white"
                                >
                                    <option value="">-- Pilih Guru Pengampu --</option>
                                    {guruList.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.nama}
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
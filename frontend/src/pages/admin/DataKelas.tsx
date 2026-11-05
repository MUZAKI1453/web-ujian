import AccountToolbar from '../../components/AccountToolbar';
import ModalOverlay from '../../components/ModalOverlay';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import AlertDialog from '../../components/AlertDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Trash2, Edit3, Layers, Search, Users } from 'lucide-react';

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

    // State untuk memicu Dialog Sukses & Error
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleOpenEdit = (item: Kelas) => {
        setIsEdit(true);
        setSelectedId(item.id);
        setNamaKelas(item.namaKelas);
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (isEdit && selectedId !== null) {
            api.put(`/admin/kelas/${selectedId}`, { namaKelas })
                .then(() => {
                    setShowModal(false);
                    setNamaKelas('');
                    fetchKelas();
                    setSuccessMessage('Data kelas berhasil diperbarui.');
                })
                .catch((err) => {
                    setErrorMessage(err.response?.data?.message || 'Gagal memperbarui kelas');
                });
        } else {
            api.post('/admin/kelas', { namaKelas })
                .then(() => {
                    setShowModal(false);
                    setNamaKelas('');
                    fetchKelas();
                    setSuccessMessage('Data kelas baru berhasil ditambahkan.');
                })
                .catch((err) => {
                    setErrorMessage(err.response?.data?.message || 'Gagal menambah kelas');
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
            <div className="ui-card ui-data-right flex flex-col items-start justify-between gap-4 py-5 pl-5 sm:py-8 sm:pl-8 lg:flex-row lg:items-center">
                <div>
                    <h1 className="ui-page-title flex items-center gap-2.5">
                        <Layers className="text-blue-600" size={28} /> Kelola Data Kelas
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Daftar seluruh nama kelas aktif.
                    </p>
                </div>

                <div className="ui-data-search-area">
                    <div className="ui-data-search">
                        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            aria-label="Cari nama kelas"
                            placeholder="Cari nama kelas..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ui-input w-full pl-10"
                        />
                    </div>

                </div>
            </div>

            {/* Tabel Data Kelas */}
            <div className="ui-card bg-white border overflow-hidden">
                <AccountToolbar role="kelas" selectedCount={visibleSelected.length}
                    onDelete={() => setDeleteIds(visibleSelected)} onAdd={handleOpenAdd} />
                <div className="overflow-x-auto">
                    <table className="ui-table w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-slate-100">
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
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400 animate-pulse">Memuat data kelas...</td>
                            </tr>
                        ) : filteredKelas.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400">Belum ada data kelas ditemukan.</td>
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
                                    <td className="py-4 px-6 font-medium text-slate-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-bold text-slate-800">{item.namaKelas}
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="ui-badge inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700">
                                            <Users size={14} /> {item._count?.users ?? 0} Siswa
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="ui-button ui-button-soft ui-icon-button"
                                                title="Edit Kelas"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="ui-button ui-button-danger-soft ui-icon-button"
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

            {/* Dialog Notifikasi Sukses */}
            {successMessage && (
                <SuccessDialog
                    title="Berhasil!"
                    message={successMessage}
                    onClose={() => setSuccessMessage(null)}
                />
            )}

            {/* Dialog Notifikasi Error / Peringatan Menggunakan AlertDialog */}
            {errorMessage && (
                <AlertDialog
                    title="Perhatian"
                    message={errorMessage}
                    onClose={() => setErrorMessage(null)}
                />
            )}

            {/* Modal Tambah / Edit Kelas */}
            {showModal && (
                <ModalOverlay>
                    <div className="ui-dialog-panel max-w-md space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">
                            {isEdit ? 'Edit Data Kelas' : 'Tambah Data Kelas Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="ui-label block mb-1">Nama Kelas</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: 7A"
                                    value={namaKelas}
                                    onChange={(e) => setNamaKelas(e.target.value)}
                                    className="ui-input w-full border focus:border-blue-600"
                                />
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
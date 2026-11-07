import AccountToolbar from '../../components/AccountToolbar';
import ModalOverlay from '../../components/ModalOverlay';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import AlertDialog from '../../components/AlertDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { BookOpen, Edit3, Trash2, Search, GraduationCap } from 'lucide-react';

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

    // State untuk memicu Dialog Sukses & Error
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleOpenEdit = (item: Mapel) => {
        setIsEdit(true);
        setSelectedId(item.id);
        setNama(item.nama);
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        const payload = { nama };

        if (isEdit && selectedId !== null) {
            api.put(`/admin/mapel/${selectedId}`, payload)
                .then(() => {
                    setShowModal(false);
                    fetchMapel();
                    setSuccessMessage('Mata pelajaran berhasil diperbarui.');
                })
                .catch((err) => {
                    setErrorMessage(err.response?.data?.message || 'Gagal memperbarui mata pelajaran');
                });
        } else {
            api.post('/admin/mapel', payload)
                .then(() => {
                    setShowModal(false);
                    fetchMapel();
                    setSuccessMessage('Mata pelajaran baru berhasil ditambahkan.');
                })
                .catch((err) => {
                    setErrorMessage(err.response?.data?.message || 'Gagal menambah mata pelajaran');
                });
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
            <div className="ui-card ui-data-right flex flex-col items-start justify-between gap-4 py-5 pl-5 sm:py-8 sm:pl-8 lg:flex-row lg:items-center">
                <div>
                    <h1 className="ui-page-title flex items-center gap-2.5">
                        <BookOpen className="text-blue-600" size={28} /> Kelola Mata Pelajaran
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Daftar mata pelajaran beserta guru pengampu.
                    </p>
                </div>

                <div className="ui-data-search-area">
                    <div className="ui-data-search">
                        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            aria-label="Cari mata pelajaran atau guru"
                            placeholder="Cari mapel atau guru..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ui-input w-full pl-10"
                        />
                    </div>

                </div>
            </div>

            {/* Tabel Data Mapel */}
            <div className="ui-card bg-white border overflow-hidden">
                <AccountToolbar role="mapel" selectedCount={visibleSelected.length}
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
                            <th className="py-4 px-6">Nama Mata Pelajaran</th>
                            <th className="py-4 px-6">Guru Pengampu</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400 animate-pulse">Memuat mata pelajaran...</td>
                            </tr>
                        ) : filteredMapel.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400">Belum ada mata pelajaran ditemukan.</td>
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
                                    <td className="py-4 px-6 font-medium text-slate-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-bold text-slate-800">{item.nama}</td>
                                    <td className="py-4 px-6">
                                        {item.pengampu.length ? item.pengampu.map(p => (
                                            <span key={p.id} className="ui-badge m-0.5 inline-flex items-center gap-1.5 bg-blue-50 text-blue-700">
                                                <GraduationCap size={14} /> {p.guru.nama} · {p.kelas.namaKelas}
                                            </span>
                                        )) : (<span className="text-xs text-slate-400 italic">Belum ditentukan</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="ui-button ui-button-edit ui-icon-button"
                                                title="Edit Mapel"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="ui-button ui-button-danger-soft ui-icon-button"
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

            {/* Dialog Notifikasi Error / Peringatan */}
            {errorMessage && (
                <AlertDialog
                    title="Perhatian"
                    message={errorMessage}
                    onClose={() => setErrorMessage(null)}
                />
            )}

            {/* Modal Tambah / Edit Mapel */}
            {showModal && (
                <ModalOverlay>
                    <div className="ui-dialog-panel max-w-md space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">
                            {isEdit ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="ui-label block mb-1">Nama Mata Pelajaran</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Matematika, Bahasa Indonesia"
                                    value={nama}
                                    onChange={(e) => setNama(e.target.value)}
                                    className="ui-input w-full border focus:border-blue-600"
                                />
                            </div>
                            <p className="text-xs text-slate-600">Atur guru pengampu beserta kelasnya melalui Data Guru.</p>
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
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Mapel'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
}
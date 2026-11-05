import Select from '../../components/ui/Select';
import ModalOverlay from '../../components/ModalOverlay';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import AlertDialog from '../../components/AlertDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import AccountToolbar from '../../components/AccountToolbar';
import AccountImportDialog from '../../components/AccountImportDialog';
import { Users, Edit3, Trash2, Search, School } from 'lucide-react';

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

    // State Modal Import
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);

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
        if (!importFile) {
            setErrorMessage('Pilih file terlebih dahulu!');
            return;
        }

        const formData = new FormData();
        formData.append('file', importFile);

        api.post('/admin/siswa/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
            .then((res) => {
                setShowImportModal(false);
                setImportFile(null);
                fetchData();
                setSuccessMessage(res.data.message || 'Import data siswa berhasil!');
            })
            .catch((err) => setErrorMessage(err.response?.data?.message || 'Gagal mengimpor data.'));
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
                        Daftar akun siswa beserta penempatan kelas.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <div className="relative min-w-0 w-full sm:w-80">
                        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input type="search" aria-label="Cari siswa berdasarkan nama atau NIS" placeholder="Cari nama atau NIS..."
                            value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="ui-input w-full pl-10" />
                    </div>
                    <div className="relative min-w-0 w-full sm:w-64 sm:shrink-0">
                        <Select aria-label="Filter kelas siswa" value={selectedKelasFilter} onValueChange={event => setSelectedKelasFilter(event)}
                            className="ui-input w-full appearance-none pr-9">
                            <option value="">Semua Kelas</option>
                            {kelasList.map(kelas => <option key={kelas.id} value={kelas.id}>{kelas.namaKelas}</option>)}
                        </Select>
                    </div>
                </div>
            </div>

            {/* Tabel Data Siswa */}
            <div className="ui-card bg-white border overflow-hidden">
                <AccountToolbar role="siswa" selectedCount={visibleSelected.length}
                    onDelete={() => setDeleteIds(visibleSelected)}
                    onImport={() => { setImportFile(null); setShowImportModal(true); }}
                    onAdd={handleOpenAdd} />
                <div className="overflow-x-auto">
                    <table className="ui-table w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-slate-100">
                            <th className="pl-6">
                                <input type="checkbox" aria-label="Pilih semua yang ditampilkan"
                                       checked={allSelected} disabled={!visibleIds.length}
                                       onChange={() => setSelectedIds(allSelected ? [] : visibleIds)} />
                            </th>
                            <th className="py-4 px-6">No</th>
                            <th className="py-4 px-6">NIS</th>
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
                                <label className="ui-label block mb-1">NIS (Angka Saja)</label>
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
                                <Select
                                    required
                                    value={kelasId}
                                    onValueChange={(e) => setKelasId(e)}
                                    className="ui-input w-full border focus:border-blue-600"
                                >
                                    <option value="">-- Pilih Kelas --</option>
                                    {kelasList.map((k) => (
                                        <option key={k.id} value={k.id}>
                                            {k.namaKelas}
                                        </option>
                                    ))}
                                </Select>
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

            {showImportModal && <AccountImportDialog role="siswa"
                onClose={() => setShowImportModal(false)} onSubmit={handleImportSubmit} onFileChange={setImportFile} />}

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
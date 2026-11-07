import Select from '../../components/ui/Select';
import ModalOverlay from '../../components/ModalOverlay';
import ClassPicker from '../../components/ClassPicker';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import AlertDialog from '../../components/AlertDialog';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import AccountToolbar from '../../components/AccountToolbar';
import AccountImportDialog from '../../components/AccountImportDialog';
import { GraduationCap, Plus, Edit3, Trash2, Search, BookOpen, X } from 'lucide-react';

interface Mapel {
    id: number;
    nama: string;
}

interface Kelas {
    id: number;
    namaKelas: string;
}

interface PengampuItem {
    mapelId: number | string;
    kelasIds: number[];
}

interface Guru {
    id: number;
    username: string; // NIP
    nama: string;
    pengampu?: {
        id: number;
        mapel: Mapel;
        kelas: Kelas;
    }[];
}

export default function DataGuru() {
    const [guruList, setGuruList] = useState<Guru[]>([]);
    const [mapelList, setMapelList] = useState<Mapel[]>([]);
    const [kelasList, setKelasList] = useState<Kelas[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMapelFilter, setSelectedMapelFilter] = useState('');

    // State Modal Form (Tambah / Edit)
    const [deleteIds, setDeleteIds] = useState<number[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [username, setUsername] = useState(''); // NIP (Angka saja)
    const [nama, setNama] = useState('');
    const [penugasanList, setPenugasanList] = useState<PengampuItem[]>([]);

    const [assignmentError, setAssignmentError] = useState('');

    // State untuk Dialog Sukses & Error Kustom
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const otherAssignments = guruList
        .filter(guru => !isEdit || guru.id !== selectedId)
        .flatMap(guru => guru.pengampu ?? []);
    function isOccupied(mapelId: number | string, kelasId: string) {
        return otherAssignments.some(item => item.mapel.id === Number(mapelId) && item.kelas.id === Number(kelasId));
    }

    // State Modal Import
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
            api.get('/admin/guru'),
            api.get('/admin/mapel'),
            api.get('/admin/kelas')
        ])
            .then(([resGuru, resMapel, resKelas]) => {
                if (resGuru.data.status === 'SUCCESS') setGuruList(resGuru.data.data);
                if (resMapel.data.status === 'SUCCESS') setMapelList(resMapel.data.data);
                if (resKelas.data.status === 'SUCCESS') setKelasList(resKelas.data.data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Gagal memuat data:', err);
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
        setPenugasanList([]);
        setAssignmentError('');
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleOpenEdit = (guru: Guru) => {
        setIsEdit(true);
        setSelectedId(guru.id);
        setUsername(guru.username);
        setNama(guru.nama);
        const grouped = new Map<number, PengampuItem>();
        for (const p of guru.pengampu ?? []) {
            const row = grouped.get(p.mapel.id) ?? { mapelId: p.mapel.id, kelasIds: [] };
            if (!row.kelasIds.includes(p.kelas.id)) row.kelasIds.push(p.kelas.id);
            grouped.set(p.mapel.id, row);
        }
        const mappedPenugasan = [...grouped.values()];
        setPenugasanList(mappedPenugasan);
        setAssignmentError('');
        setErrorMessage(null);
        setShowModal(true);
    };

    const handleAddPenugasanRow = () => {
        setPenugasanList([...penugasanList, { mapelId: '', kelasIds: [] }]);
    };

    const handleRemovePenugasanRow = (index: number) => {
        const updated = penugasanList.filter((_, i) => i !== index);
        setPenugasanList(updated);
    };

    const handlePenugasanChange = (index: number, value: string) => {
        const updated = [...penugasanList];
        updated[index] = { mapelId: value, kelasIds: [] };
        setPenugasanList(updated);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (penugasanList.some(item => !item.mapelId || !item.kelasIds.length)) {
            setAssignmentError('Lengkapi mata pelajaran dan kelas pada setiap penugasan.');
            return;
        }
        setAssignmentError('');
        if (penugasanList.some(item => item.kelasIds.some(id => isOccupied(item.mapelId, String(id))))) {
            setAssignmentError('Mata pelajaran di kelas yang dipilih sudah diampu guru lain.');
            return;
        }
        const payload = {
            username,
            nama,
            pengampu: penugasanList.flatMap(({ mapelId, kelasIds }) => kelasIds.map(kelasId => ({ mapelId, kelasId })))
        };

        if (isEdit && selectedId !== null) {
            api.put(`/admin/guru/${selectedId}`, payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                    setSuccessMessage('Data guru berhasil diperbarui.');
                })
                .catch((err) => {
                    const msg = err.response?.data?.message || 'Gagal memperbarui guru';
                    setAssignmentError(msg);
                    setErrorMessage(msg);
                });
        } else {
            api.post('/admin/guru', payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                    setSuccessMessage('Data guru baru berhasil ditambahkan.');
                })
                .catch((err) => {
                    const msg = err.response?.data?.message || 'Gagal menambah guru';
                    setAssignmentError(msg);
                    setErrorMessage(msg);
                });
        }
    };

    const handleImportSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile) {
            setErrorMessage('Pilih file terlebih dahulu!');
            return;
        }

        const formData = new FormData();
        formData.append('file_excel', importFile);

        api.post('/admin/guru/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
            .then((res) => {
                setShowImportModal(false);
                setImportFile(null);
                fetchData();
                setSuccessMessage(res.data.message || 'Import data guru berhasil!');
            })
            .catch((err) => setErrorMessage(err.response?.data?.message || 'Gagal mengimpor data.'));
    };

    const filteredGuru = guruList.filter(g => {
        const matchesSearch = g.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
            g.username.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesMapel = selectedMapelFilter === '' ||
            g.pengampu?.some(assignment => String(assignment.mapel?.id) === selectedMapelFilter);
        return matchesSearch && matchesMapel;
    });

    const visibleIds = filteredGuru.map(item => item.id);
    const visibleSelected = visibleIds.filter(id => selectedIds.includes(id));
    const allSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header Utama & Kontrol */}
            <div className="ui-card ui-data-right flex flex-col items-start justify-between gap-4 py-5 pl-5 sm:py-8 sm:pl-8 lg:flex-row lg:items-center">
                <div>
                    <h1 className="ui-page-title flex items-center gap-2.5">
                        <GraduationCap className="text-blue-600" size={28} /> Kelola Data Guru
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Daftar akun guru beserta mata pelajaran dan kelas yang diampu.
                    </p>
                </div>

                <div className="ui-data-search-area">
                    <div className="ui-data-search">
                        <Search size={18} className="pointer-events-none absolute left-3.5 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            aria-label="Cari guru berdasarkan nama atau NIP"
                            placeholder="Cari nama atau NIP..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ui-input w-full pl-10"
                        />
                    </div>
                </div>
            </div>

            {/* Tabel Data Guru */}
            <div className="ui-card bg-white border overflow-hidden">
                <AccountToolbar role="guru" selectedCount={visibleSelected.length}
                    onDelete={() => setDeleteIds(visibleSelected)}
                    onImport={() => { setImportFile(null); setShowImportModal(true); }}
                    onAdd={handleOpenAdd}
                    filter={<Select aria-label="Filter mata pelajaran guru" value={selectedMapelFilter}
                            onValueChange={event => setSelectedMapelFilter(event)} className="ui-input w-full appearance-none pr-9">
                            <option value="">Semua Mapel</option>
                            {mapelList.map(mapel => <option key={mapel.id} value={mapel.id}>{mapel.nama}</option>)}
                        </Select>} />
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
                            <th className="py-4 px-6">NIP</th>
                            <th className="py-4 px-6">Nama Lengkap & Gelar</th>
                            <th className="py-4 px-6">Mata Pelajaran & Kelas Diampu</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-slate-400 animate-pulse">Memuat data guru...</td>
                            </tr>
                        ) : filteredGuru.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-slate-400">Belum ada data guru ditemukan.</td>
                            </tr>
                        ) : (
                            filteredGuru.map((item, index) => (
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
                                        {item.pengampu && item.pengampu.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.pengampu.map((p) => (
                                                    <span key={p.id} className="ui-badge inline-flex items-center gap-1 bg-blue-50 text-blue-700">
                                                        <BookOpen size={12} /> {p.mapel?.nama} ({p.kelas.namaKelas})
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Belum ada penugasan</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="ui-button ui-button-edit ui-icon-button"
                                                title="Edit Guru"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="ui-button ui-button-danger-soft ui-icon-button"
                                                title="Hapus Guru"
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
                    role="guru"
                    ids={deleteIds}
                    onClose={() => setDeleteIds([])}
                    onDeleted={() => {
                        setSelectedIds([]);
                        fetchData();
                        setSuccessMessage('Data guru berhasil dihapus.');
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

            {/* Modal Tambah / Edit Guru & Penugasan Dinamis */}
            {showModal && (
                <ModalOverlay>
                    <div className="ui-dialog-panel max-w-xl space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">
                            {isEdit ? 'Edit Data Guru & Penugasan' : 'Tambah Guru & Penugasan Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="ui-label block mb-1">NIP (Angka Saja)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    required
                                    placeholder="Contoh: 198501252010011001"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/\D/g, ''))}
                                    className="ui-input w-full border focus:border-blue-600 font-mono"
                                />
                            </div>
                            <div>
                                <label className="ui-label block mb-1">Nama Lengkap & Gelar</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Budi Santoso, S.Pd."
                                    value={nama}
                                    onChange={(e) => setNama(e.target.value)}
                                    className="ui-input w-full border focus:border-blue-600"
                                />
                            </div>

                            {/* Bagian Penugasan Mengajar Dinamis */}
                            <div className="border-t border-slate-100 pt-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="ui-label block">Mata Pelajaran & Kelas yang Diampu</label>
                                    <button
                                        type="button"
                                        onClick={handleAddPenugasanRow}
                                        className="ui-button ui-button-soft text-xs flex items-center gap-1"
                                    >
                                        <Plus size={14} /> Tambah Mapel Ajar
                                    </button>
                                </div>

                                {penugasanList.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center">
                                        Tambahkan mapel dan pilih kelas. Pilihan yang sudah diampu guru lain akan dinonaktifkan.
                                    </p>
                                ) : (
                                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                        {penugasanList.map((p, index) => (
                                            <div key={index} className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <div className="flex items-center gap-2">
                                                <Select
                                                    value={p.mapelId}
                                                    onValueChange={(e) => handlePenugasanChange(index, e)}
                                                    aria-label="Mata pelajaran penugasan"
                                                    className="ui-input flex-1 border focus:border-blue-600"
                                                    required
                                                >
                                                    <option value="">-- Pilih Mapel --</option>
                                                    {mapelList.map((m) => (
                                                        <option key={m.id} value={m.id} disabled={penugasanList.some((row, i) => i !== index && Number(row.mapelId) === m.id) || (kelasList.length > 0 && kelasList.every(k => isOccupied(m.id, String(k.id))))}>{m.nama}</option>
                                                    ))}
                                                </Select>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePenugasanRow(index)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                    title="Hapus baris"
                                                >
                                                    <X size={16} />
                                                </button>
                                                </div>
                                                <ClassPicker label="Kelas yang diampu" classes={kelasList} selected={p.kelasIds} disabled={!p.mapelId}
                                                    unavailable={id => isOccupied(p.mapelId, String(id))}
                                                    onChange={kelasIds => setPenugasanList(rows => rows.map((row, i) => i === index ? { ...row, kelasIds } : row))} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {assignmentError && <p role="alert" className="ui-notice ui-notice-error">{assignmentError}</p>}
                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
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
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Guru'}
                                </button>
                            </div>
                        </form>
                    </div>
                </ModalOverlay>
            )}

            {showImportModal && <AccountImportDialog role="guru"
                onClose={() => setShowImportModal(false)} onSubmit={handleImportSubmit} onFileChange={setImportFile} />}
        </div>
    );
}

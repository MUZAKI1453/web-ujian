import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import { schoolGrades } from '../../schoolGrades';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { downloadImportTemplate } from '../../services/downloadImportTemplate';
import { GraduationCap, Plus, Edit3, Trash2, Search, UploadCloud, BookOpen, X } from 'lucide-react';

interface Mapel {
    id: number;
    nama: string;
}

interface Kelas {
    id: number;
    namaKelas: string;
    tingkat: number | null;
}

interface PengampuItem {
    mapelId: number | string;
    cakupan: string;
}

interface Guru {
    id: number;
    username: string; // NIP
    nama: string;
    pengampu?: {
        id: number;
        mapel: Mapel;
        kelas: Kelas | null;
        tingkat: number | null;
    }[];
}

export default function DataGuru() {
    const [guruList, setGuruList] = useState<Guru[]>([]);
    const [mapelList, setMapelList] = useState<Mapel[]>([]);
    const [kelasList, setKelasList] = useState<Kelas[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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

    // State untuk Dialog Sukses
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const otherAssignments = guruList
        .filter(guru => !isEdit || guru.id !== selectedId)
        .flatMap(guru => guru.pengampu ?? []);
    const scopes = [...schoolGrades.map(grade => 'tingkat:' + grade), ...kelasList.map(kelas => 'kelas:' + kelas.id)];

    function isOccupied(mapelId: number | string, scope: string) {
        const [kind, value] = scope.split(':');
        const id = Number(value);
        const grade = kind === 'tingkat' ? id : kelasList.find(kelas => kelas.id === id)?.tingkat;
        return otherAssignments.some(item => {
            if (item.mapel.id !== Number(mapelId)) return false;
            if (kind === 'kelas' && item.kelas) return item.kelas.id === id;
            return (item.kelas ? item.kelas.tingkat : item.tingkat) === grade;
        });
    }

    // State Modal Import Excel
    const [showImportModal, setShowImportModal] = useState(false);
    const [fileExcel, setFileExcel] = useState<File | null>(null);

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
        setShowModal(true);
    };

    const handleOpenEdit = (guru: Guru) => {
        setIsEdit(true);
        setSelectedId(guru.id);
        setUsername(guru.username);
        setNama(guru.nama);
        const mappedPenugasan = guru.pengampu?.map((p) => ({
            mapelId: p.mapel.id,
            cakupan: p.kelas ? 'kelas:' + p.kelas.id : 'tingkat:' + p.tingkat
        })) || [];
        setPenugasanList(mappedPenugasan);
        setAssignmentError('');
        setShowModal(true);
    };

    const handleAddPenugasanRow = () => {
        setPenugasanList([...penugasanList, { mapelId: '', cakupan: '' }]);
    };

    const handleRemovePenugasanRow = (index: number) => {
        const updated = penugasanList.filter((_, i) => i !== index);
        setPenugasanList(updated);
    };

    const handlePenugasanChange = (index: number, field: 'mapelId' | 'cakupan', value: string) => {
        const updated = [...penugasanList];
        updated[index][field] = value;
        setPenugasanList(updated);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (penugasanList.some(item => !item.mapelId || !item.cakupan)) {
            alert('Lengkapi mata pelajaran dan cakupan pada setiap penugasan.');
            return;
        }
        setAssignmentError('');
        if (penugasanList.some(item => isOccupied(item.mapelId, item.cakupan))) {
            setAssignmentError('Mata pelajaran pada cakupan yang dipilih sudah diampu guru lain.');
            return;
        }
        const payload = {
            username,
            nama,
            pengampu: penugasanList.map(({ mapelId, cakupan }) => {
                const [jenis, id] = cakupan.split(':');
                return jenis === 'tingkat' ? { mapelId, tingkat: Number(id) } : { mapelId, kelasId: Number(id) };
            })
        };

        if (isEdit && selectedId !== null) {
            api.put(`/admin/guru/${selectedId}`, payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                    setSuccessMessage('Data guru berhasil diperbarui.');
                })
                .catch((err) => setAssignmentError(err.response?.data?.message || 'Gagal memperbarui guru'));
        } else {
            api.post('/admin/guru', payload)
                .then(() => {
                    setShowModal(false);
                    fetchData();
                    setSuccessMessage('Data guru baru berhasil ditambahkan.');
                })
                .catch((err) => setAssignmentError(err.response?.data?.message || 'Gagal menambah guru'));
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

        api.post('/admin/guru/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
            .then((res) => {
                setShowImportModal(false);
                setFileExcel(null);
                fetchData();
                setSuccessMessage(res.data.message || 'Import data guru berhasil!');
            })
            .catch((err) => alert(err.response?.data?.message || 'Gagal mengimport file Excel'));
    };

    const filteredGuru = guruList.filter((g) =>
        g.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const visibleIds = filteredGuru.map(item => item.id);
    const visibleSelected = visibleIds.filter(id => selectedIds.includes(id));
    const allSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header Utama & Kontrol */}
            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2.5">
                        <GraduationCap className="text-blue-600" size={28} /> Kelola Data Guru & Penugasan
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Daftar akun guru beserta pengaturan mata pelajaran dan kelas yang diampu.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="relative flex items-center w-full sm:w-64">
                        <Search size={18} className="absolute left-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cari nama atau NIP..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/65 focus:bg-white border border-gray-200 focus:border-blue-600 rounded-2xl focus:outline-none text-sm text-gray-700 transition"
                        />
                    </div>
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl font-semibold shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 text-sm shrink-0"
                    >
                        <UploadCloud size={18} /> Import Excel
                    </button>
                    <button
                        onClick={handleOpenAdd}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl font-semibold shadow-md shadow-blue-600/20 transition-all hover:-translate-y-0.5 text-sm shrink-0"
                    >
                        <Plus size={18} /> Tambah Guru
                    </button>
                </div>
            </div>

            {/* Tabel Data Guru */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr>
                            <td colSpan={6} className="px-6 py-3">
                                <button type="button" disabled={!visibleSelected.length}
                                        onClick={() => setDeleteIds(visibleSelected)}
                                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                                    Hapus terpilih ({visibleSelected.length})
                                </button>
                            </td>
                        </tr>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-gray-100">
                            <th className="pl-6">
                                <input type="checkbox" aria-label="Pilih semua yang ditampilkan"
                                       checked={allSelected} disabled={!visibleIds.length}
                                       onChange={() => setSelectedIds(allSelected ? [] : visibleIds)} />
                            </th>
                            <th className="py-4 px-6">No</th>
                            <th className="py-4 px-6">NIP / Username</th>
                            <th className="py-4 px-6">Nama Lengkap & Gelar</th>
                            <th className="py-4 px-6">Mata Pelajaran & Kelas Diampu</th>
                            <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-gray-400 animate-pulse">Memuat data guru...</td>
                            </tr>
                        ) : filteredGuru.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-gray-400">Belum ada data guru ditemukan.</td>
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
                                    <td className="py-4 px-6 font-medium text-gray-500">{index + 1}</td>
                                    <td className="py-4 px-6 font-mono font-semibold text-gray-600">{item.username}</td>
                                    <td className="py-4 px-6 font-bold text-gray-800">{item.nama}</td>
                                    <td className="py-4 px-6">
                                        {item.pengampu && item.pengampu.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.pengampu.map((p) => (
                                                    <span key={p.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full">
                                                        <BookOpen size={12} /> {p.mapel?.nama} ({p.kelas?.namaKelas ?? 'Tingkat ' + p.tingkat + ' · ' + kelasList.filter(k => k.tingkat === p.tingkat).length + ' kelas'})
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Belum ada penugasan</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-colors"
                                                title="Edit Guru"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteIds([item.id])}
                                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
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

            {/* Modal Tambah / Edit Guru & Penugasan Dinamis */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-gray-800">
                            {isEdit ? 'Edit Data Guru & Penugasan' : 'Tambah Guru & Penugasan Baru'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">NIP / Username (Angka Saja)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    required
                                    placeholder="Contoh: 198501252010011001"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nama Lengkap & Gelar</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Contoh: Budi Santoso, S.Pd."
                                    value={nama}
                                    onChange={(e) => setNama(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-600 text-sm"
                                />
                            </div>

                            {/* Bagian Penugasan Mengajar Dinamis */}
                            <div className="border-t border-gray-100 pt-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="block text-xs font-bold uppercase text-gray-500">Mata Pelajaran & Kelas yang Diampu</label>
                                    <button
                                        type="button"
                                        onClick={handleAddPenugasanRow}
                                        className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1"
                                    >
                                        <Plus size={14} /> Tambah Kelas/Mapel Ajar
                                    </button>
                                </div>

                                {penugasanList.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic bg-slate-50 p-3 rounded-xl text-center">
                                        Tambahkan mapel dan pilih cakupan. Pilihan yang sudah diampu guru lain akan dinonaktifkan.
                                    </p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {penugasanList.map((p, index) => (
                                            <div key={index} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-gray-100">
                                                <select
                                                    value={p.mapelId}
                                                    onChange={(e) => handlePenugasanChange(index, 'mapelId', e.target.value)}
                                                    className="w-1/2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:border-blue-600"
                                                    required
                                                >
                                                    <option value="">-- Pilih Mapel --</option>
                                                    {mapelList.map((m) => (
                                                        <option key={m.id} value={m.id} disabled={p.cakupan ? isOccupied(m.id, p.cakupan) : scopes.length > 0 && scopes.every(scope => isOccupied(m.id, scope))}>{m.nama}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={p.cakupan}
                                                    aria-label="Cakupan penugasan"
                                                    onChange={(e) => handlePenugasanChange(index, 'cakupan', e.target.value)}
                                                    className="w-1/2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:border-blue-600"
                                                    required
                                                >
                                                    <option value="">Pilih cakupan</option>
                                                    <optgroup label="Per tingkat">
                                                        {schoolGrades.map(grade => (
                                                            <option key={grade} value={'tingkat:' + grade} disabled={isOccupied(p.mapelId, 'tingkat:' + grade)}>Semua kelas tingkat {grade}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Per kelas">
                                                        {kelasList.map(k => (
                                                            <option key={k.id} value={'kelas:' + k.id} disabled={isOccupied(p.mapelId, 'kelas:' + k.id)}>{k.namaKelas}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePenugasanRow(index)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                    title="Hapus baris"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {assignmentError && <p role="alert" className="text-sm text-red-700">{assignmentError}</p>}
                            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
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
                                    {isEdit ? 'Simpan Perubahan' : 'Simpan Guru'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Import Excel Guru */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">Import Data Guru via Excel</h3>
                        <p className="text-sm text-slate-600">Pertahankan judul kolom di baris 11. Ganti contoh dengan NIP dan nama lengkap guru mulai baris 12. Tulis NIP sebagai teks agar nol di depan tetap tersimpan.</p>
                        <button
                            type="button"
                            onClick={() => void downloadImportTemplate('guru')}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                        >
                            Unduh Template Guru
                        </button>
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
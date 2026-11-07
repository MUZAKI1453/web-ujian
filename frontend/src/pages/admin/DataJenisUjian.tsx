import { useEffect, useState, type FormEvent } from 'react';
import { ClipboardList, Edit3, Search, Trash2 } from 'lucide-react';
import AccountToolbar from '../../components/AccountToolbar';
import ModalOverlay from '../../components/ModalOverlay';
import DeleteAccountDialog from '../../components/DeleteAccountDialog';
import SuccessDialog from '../../components/SuccessDialog';
import AlertDialog from '../../components/AlertDialog';
import api from '../../services/api';
import { errorMessage } from '../guru/QuestionEditor';

type ExamType = { id: number; nama: string; _count: { ujian: number } };

export default function DataJenisUjian() {
    const [items, setItems] = useState<ExamType[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editor, setEditor] = useState<{ id?: number; nama: string } | null>(null);
    const [deleteIds, setDeleteIds] = useState<number[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    async function reload() {
        setLoading(true);
        try {
            const { data } = await api.get<ExamType[]>('/admin/jenis-ujian');
            setItems(data);
        } catch (err) { setError(errorMessage(err)); }
        finally { setLoading(false); }
    }
    useEffect(() => {
        const controller = new AbortController();
        api.get<ExamType[]>('/admin/jenis-ujian', { signal: controller.signal })
            .then(({ data }) => setItems(data))
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    function openEditor(item?: ExamType) {
        if (busy) return;
        setError(''); setNotice('');
        setEditor(item ? { id: item.id, nama: item.nama } : { nama: '' });
    }
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !editor) return;
        setBusy(true); setError(''); setNotice('');
        try {
            const payload = { nama: editor.nama };
            if (editor.id) await api.put('/admin/jenis-ujian/' + editor.id, payload);
            else await api.post('/admin/jenis-ujian', payload);
            setEditor(null);
            setNotice(editor.id ? 'Jenis ujian berhasil diperbarui.' : 'Jenis ujian baru berhasil ditambahkan.');
            await reload();
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }
    const matches = items.filter(item => item.nama.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')));
    const selectableIds = matches.filter(item => !item._count.ujian).map(item => item.id);
    const visibleSelected = selectableIds.filter(id => selectedIds.includes(id));
    const allSelected = selectableIds.length > 0 && visibleSelected.length === selectableIds.length;

    return <div className="space-y-6 max-w-7xl mx-auto">
        <header className="ui-card ui-data-right flex flex-col items-start justify-between gap-4 py-5 pl-5 sm:py-8 sm:pl-8 lg:flex-row lg:items-center">
            <div>
                <h1 className="ui-page-title flex items-center gap-2.5"><ClipboardList size={28} className="text-blue-600" aria-hidden="true" />Kelola Jenis Ujian</h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">Daftar jenis ujian yang dapat dipilih semua guru.</p>
            </div>
            <div className="ui-data-search-area">
                <div className="ui-data-search">
                    <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input type="search" aria-label="Cari jenis ujian" placeholder="Cari jenis ujian..." value={search} onChange={event => setSearch(event.target.value)} className="ui-input w-full pl-10" />
                </div>
            </div>
        </header>
        <section className="ui-card bg-white border overflow-hidden">
            <AccountToolbar role="jenis-ujian" selectedCount={busy || loading ? 0 : visibleSelected.length}
                onDelete={() => setDeleteIds(visibleSelected)} onAdd={() => openEditor()} />
            <div className="overflow-x-auto">
                <table className="ui-table w-full text-left border-collapse">
                    <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold tracking-wider border-b border-slate-100">
                        <th scope="col" className="pl-6 w-12"><input type="checkbox" aria-label="Pilih semua jenis ujian yang dapat dihapus" checked={allSelected} disabled={busy || loading || !selectableIds.length} onChange={() => setSelectedIds(allSelected ? [] : selectableIds)} /></th>
                        <th scope="col" className="py-4 px-6">No</th>
                        <th scope="col" className="py-4 px-6">Nama Jenis Ujian</th>
                        <th scope="col" className="py-4 px-6">Jumlah Ujian</th>
                        <th scope="col" className="py-4 px-6 text-center">Aksi</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {loading ? <tr><td colSpan={5} className="text-center py-12 text-slate-400 animate-pulse">Memuat jenis ujian...</td></tr> : !matches.length ?
                            <tr><td colSpan={5} className="text-center py-12 text-slate-400">{items.length ? 'Jenis ujian tidak ditemukan.' : 'Belum ada jenis ujian. Klik Tambah untuk membuat jenis ujian baru.'}</td></tr> :
                            matches.map((item, index) => <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="pl-6"><input type="checkbox" aria-label={'Pilih ' + item.nama} title={item._count.ujian ? 'Jenis ujian sudah digunakan dan tidak dapat dihapus' : undefined}
                                    disabled={busy || item._count.ujian > 0} checked={visibleSelected.includes(item.id)}
                                    onChange={event => { const checked = event.target.checked; setSelectedIds(ids => checked ? [...ids, item.id] : ids.filter(id => id !== item.id)); }} /></td>
                                <td className="py-4 px-6 font-medium text-slate-500">{index + 1}</td>
                                <td className="py-4 px-6 font-bold text-slate-800">{item.nama}</td>
                                <td className="py-4 px-6"><span className="ui-badge inline-flex items-center gap-1.5 bg-blue-50 text-blue-700"><ClipboardList size={14} aria-hidden="true" />{item._count.ujian} Ujian</span></td>
                                <td className="py-4 px-6 text-center"><div className="flex items-center justify-center gap-2">
                                    <button type="button" disabled={busy} title="Edit Jenis Ujian" aria-label={'Edit ' + item.nama} className="ui-button ui-button-edit ui-icon-button" onClick={() => openEditor(item)}><Edit3 size={16} aria-hidden="true" /></button>
                                    <button type="button" disabled={busy || item._count.ujian > 0} title={item._count.ujian ? 'Jenis ujian sudah digunakan dan tidak dapat dihapus' : 'Hapus Jenis Ujian'} aria-label={'Hapus ' + item.nama} className="ui-button ui-button-danger-soft ui-icon-button" onClick={() => setDeleteIds([item.id])}><Trash2 size={16} aria-hidden="true" /></button>
                                </div></td>
                            </tr>)}
                    </tbody>
                </table>
            </div>
        </section>
        {deleteIds.length > 0 && <DeleteAccountDialog role="jenis-ujian" ids={deleteIds} onClose={() => setDeleteIds([])}
            onDeleted={() => { setSelectedIds([]); setNotice('Jenis ujian berhasil dihapus.'); void reload(); }} />}
        {notice && <SuccessDialog title="Berhasil!" message={notice} onClose={() => setNotice('')} />}
        {editor && <ModalOverlay label={editor.id ? 'Edit jenis ujian' : 'Tambah jenis ujian'} onClose={() => { if (!busy) setEditor(null); }}>
            <div className="ui-dialog-panel max-w-md space-y-4">
                <h3 className="text-lg font-bold text-slate-800">{editor.id ? 'Edit Jenis Ujian' : 'Tambah Jenis Ujian Baru'}</h3>
                <form onSubmit={save} className="space-y-4">
                    <div><label htmlFor="nama-jenis-ujian" className="ui-label block mb-1">Nama Jenis Ujian</label>
                        <input id="nama-jenis-ujian" type="text" autoFocus required maxLength={150} disabled={busy} value={editor.nama} onChange={event => setEditor({ ...editor, nama: event.target.value })} placeholder="Contoh: Ulangan Harian, PTS, PAS" className="ui-input w-full border focus:border-blue-600" />
                    </div>
                    <p className="text-xs text-slate-600">Jenis ujian yang sudah digunakan tidak dapat dihapus. Perubahan nama tidak mengubah ujian yang sudah terbit.</p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" disabled={busy} className="ui-button ui-button-secondary" onClick={() => setEditor(null)}>Batal</button>
                        <button type="submit" disabled={busy || !editor.nama.trim()} className="ui-button ui-button-primary">{busy ? 'Menyimpan…' : editor.id ? 'Simpan Perubahan' : 'Simpan Jenis Ujian'}</button>
                    </div>
                </form>
            </div>
        </ModalOverlay>}
        {error && <AlertDialog title="Perhatian" message={error} onClose={() => setError('')} />}
    </div>;
}

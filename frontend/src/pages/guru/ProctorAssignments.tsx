import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { primaryClass } from '../../components/ui/styles';
import { errorMessage } from './QuestionEditor';

type Teacher = { id: number; nama: string | null; username: string };
type Row = { guruId: number | ''; kelasIds: number[] };
type Data = { kelas: { id: number; namaKelas: string }[]; guru: Teacher[]; penugasan: { guruId: number; kelasIds: number[] }[] };

// Guru pemilik ujian (atau admin) menunjuk guru lain sebagai pengawas per kelas.
// Pengawas mendapat menu Pengawasan dan hanya melihat peserta kelas yang ditugaskan.
export default function ProctorAssignments({ url, readOnly }: { url: string; readOnly: boolean }) {
    const [data, setData] = useState<Data | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        api.get<Data>(url + '/pengawas', { signal: controller.signal })
            .then(({ data }) => { setData(data); setRows(data.penugasan); })
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
        return () => controller.abort();
    }, [url]);

    if (!data) return <p className="text-sm text-slate-500">{error || 'Memuat pengawas…'}</p>;
    const change = (index: number, next: Partial<Row>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...next } : row));
    const chosen = new Set(rows.map(row => row.guruId));
    const complete = rows.every(row => row.guruId !== '' && row.kelasIds.length > 0);

    async function save() {
        setBusy(true); setError(''); setNotice('');
        try {
            await api.put(url + '/pengawas', { penugasan: rows });
            setNotice(rows.length ? 'Pengawas disimpan.' : 'Semua pengawas dihapus.');
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    return <div className="space-y-3">
        <p className="text-sm text-slate-600">Pengawas melihat kehadiran dan pelanggaran peserta di kelas yang ditugaskan, dapat membuka atau menutup akses masuk, membatalkan pelanggaran dengan alasan, dan menulis catatan. Pengawas tidak melihat soal, kunci, jawaban, dan nilai.</p>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
        <fieldset disabled={busy || readOnly} className="space-y-3">
            {!rows.length && <p className="text-sm text-slate-500">Belum ada pengawas untuk ujian ini.</p>}
            {rows.map((row, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-end gap-2">
                    <label className="ui-label block min-w-0 flex-1">Pengawas {index + 1}
                        <select className="ui-input mt-1 block w-full" value={row.guruId} onChange={event => change(index, { guruId: event.target.value ? Number(event.target.value) : '' })}>
                            <option value="">Pilih guru…</option>
                            {data.guru.map(teacher => <option key={teacher.id} value={teacher.id} disabled={teacher.id !== row.guruId && chosen.has(teacher.id)}>
                                {teacher.nama || teacher.username}</option>)}
                        </select>
                    </label>
                    <button type="button" aria-label={'Hapus pengawas ' + (index + 1)} title="Hapus pengawas"
                        className="grid size-10 shrink-0 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                        onClick={() => setRows(current => current.filter((_, i) => i !== index))}><Trash2 size={17} aria-hidden="true" /></button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={'Kelas yang diawasi pengawas ' + (index + 1)}>
                    {data.kelas.map(item => {
                        const active = row.kelasIds.includes(item.id);
                        return <label key={item.id} className={'flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold ' +
                            (active ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700')}>
                            <input type="checkbox" className="size-4 accent-blue-600" checked={active}
                                onChange={() => change(index, { kelasIds: active ? row.kelasIds.filter(id => id !== item.id) : [...row.kelasIds, item.id] })} />
                            {item.namaKelas}
                        </label>;
                    })}
                </div>
            </div>)}
            <div className="flex flex-wrap gap-2">
                <button type="button" className="ui-button ui-button-secondary" disabled={rows.length >= data.guru.length}
                    onClick={() => setRows(current => [...current, { guruId: '', kelasIds: data.kelas.map(item => item.id) }])}><Plus size={16} aria-hidden="true" />Tambah pengawas</button>
                <button type="button" className={primaryClass} disabled={!complete} onClick={() => void save()}>Simpan Pengawas</button>
            </div>
            {!complete && <p className="text-xs text-amber-800">Pilih guru dan minimal satu kelas untuk setiap pengawas.</p>}
        </fieldset>
    </div>;
}

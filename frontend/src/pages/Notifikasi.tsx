import { useEffect, useState } from 'react';
import { Bell, ShieldAlert } from 'lucide-react';
import ExamTypeBadge from '../components/ExamTypeBadge';
import api from '../services/api';
import { errorMessage } from './guru/QuestionEditor';
import { violationLabels } from './siswa/useExamSecurity';

type Notice = { id: number; waktu: string; ujian: { judul: string; mapel: { nama: string } } } & (
    { jenis: string; dibaca: boolean } | { siswa: string; alasan: keyof typeof violationLabels | null }
);

const resultLabels: Record<string, string> = {
    'hasil-dirilis': 'Hasil dirilis',
    'nilai-diperbarui': 'Nilai diperbarui',
    'pembahasan-dirilis': 'Pembahasan dirilis'
};
const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export default function Notifikasi({ role }: { role: 'guru' | 'siswa' }) {
    const [items, setItems] = useState<Notice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        let next: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const { data } = await api.get<{ data: Notice[] }>(`/${role}/notifikasi`, { signal: controller.signal, timeout: 10000 });
                if (controller.signal.aborted) return;
                setItems(current => {
                    const read = new Set(current.filter(item => 'dibaca' in item && item.dibaca).map(item => item.id));
                    return data.data.map(item => 'dibaca' in item && read.has(item.id) ? { ...item, dibaca: true } : item);
                });
                setError('');
            } catch (err) {
                if (!controller.signal.aborted) setError(errorMessage(err));
            } finally {
                if (!controller.signal.aborted) { setLoading(false); next = setTimeout(load, 15000); }
            }
        }
        void load();
        return () => { controller.abort(); clearTimeout(next); };
    }, [role]);

    async function markRead(id: number) {
        try {
            await api.patch(`/siswa/notifikasi/${id}`);
            setItems(current => current.map(item => item.id === id && 'dibaca' in item ? { ...item, dibaca: true } : item));
        } catch (err) { setError(errorMessage(err)); }
    }

    return <section className="mx-auto max-w-3xl space-y-4">
        <header className="ui-card p-5">
            <h1 className="ui-page-title flex items-center gap-2"><Bell size={24} className="text-blue-600" aria-hidden="true" />Notifikasi</h1>
            <p className="mt-1 text-sm text-slate-500">{role === 'guru' ? 'Peringatan keamanan dari ujian yang Anda kelola.' : 'Pembaruan hasil, nilai, dan pembahasan ujian.'}</p>
        </header>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {loading && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat notifikasi…</p>}
        {!loading && !error && !items.length && <p className="ui-card p-5 text-sm text-slate-500">Belum ada notifikasi.</p>}
        {items.length > 0 && <ul className="ui-card divide-y divide-slate-100">
            {items.map(item => <li key={item.id} className="flex items-start gap-3 p-4 sm:p-5">
                <span className={'grid size-9 shrink-0 place-items-center rounded-lg ' + ('siswa' in item ? 'bg-yellow-100 text-yellow-900' : 'bg-blue-50 text-blue-700')}>
                    {'siswa' in item ? <ShieldAlert size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold">{item.ujian.mapel.nama}</h2><ExamTypeBadge label={item.ujian.judul} /></div>
                    <p className="break-words text-sm text-slate-700">{'siswa' in item
                        ? `${item.siswa} · ${item.alasan ? violationLabels[item.alasan] ?? 'Peringatan keamanan ujian' : 'Peringatan keamanan ujian'}`
                        : resultLabels[item.jenis] ?? item.jenis}</p>
                    <time dateTime={item.waktu} className="block text-xs text-slate-500">{date.format(new Date(item.waktu))}</time>
                    {'dibaca' in item && !item.dibaca && <button type="button" onClick={() => void markRead(item.id)} className="min-h-11 text-sm font-semibold text-blue-700 hover:underline">Tandai sudah dibaca</button>}
                </div>
            </li>)}
        </ul>}
    </section>;
}

import Select from '../../components/ui/Select';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock3, MonitorCheck, RefreshCw, Search, Users } from 'lucide-react';
import api from '../../services/api';

interface Participant {
    id: number;
    nama: string | null;
    username: string;
    status: string;
    batasWaktu: string | null;
}

interface Session {
    id: string;
    judul: string;
    mapel: string;
    kelas: string;
    jenis: 'Reguler' | 'Susulan';
    nomorSusulan?: number;
    mulai: string;
    selesai: string;
    status: string;
    mengerjakan: number;
    mengirim: number;
    belumMulai: number;
    waktuHabis: number;
    peserta: Participant[];
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const fullDateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const statusStyles: Record<string, string> = {
    Berlangsung: 'bg-blue-50 text-blue-700',
    Terjadwal: 'bg-amber-50 text-amber-800',
    Selesai: 'bg-slate-100 text-slate-600',
    Mengerjakan: 'bg-blue-50 text-blue-700',
    'Sudah mengirim': 'bg-emerald-50 text-emerald-700',
    'Waktu habis': 'bg-amber-50 text-amber-800',
    'Belum mulai': 'bg-slate-100 text-slate-600'
};
const statusLabel = (status: string) => status === 'Sudah mengirim' ? 'Terkumpul' : status;

function schedule(session: Session) {
    const start = new Date(session.mulai), end = new Date(session.selesai);
    return dateFormat.format(start) + ' · ' + timeFormat.format(start) + '–' +
        (start.toDateString() === end.toDateString() ? '' : dateFormat.format(end) + ' · ') + timeFormat.format(end);
}

function SessionCard({ session }: { session: Session }) {
    const [query, setQuery] = useState('');
    const keyword = query.trim().toLocaleLowerCase('id-ID');
    const participants = session.peserta.filter(student =>
        ((student.nama ?? '') + ' ' + student.username).toLocaleLowerCase('id-ID').includes(keyword));
    const total = session.peserta.length;
    const progress = total ? Math.min(100, Math.round(session.mengirim / total * 100)) : 0;
    return <details className="ui-card group overflow-hidden">
        <summary className="monitor-session-summary cursor-pointer list-none p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-5">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-base font-semibold leading-snug text-slate-800">{session.judul}</h2>
                        <span className={'ui-badge ' + (statusStyles[session.status] ?? statusStyles.Selesai)}>{session.status}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-500">{session.mapel} · {session.kelas} · {session.jenis}{session.nomorSusulan ? ' ' + session.nomorSusulan : ''}</p>
                </div>
                <ChevronDown size={18} aria-hidden="true" className="mt-1 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" />{schedule(session)}</span>
                <span className="flex flex-wrap items-center gap-3">
                    {session.mengerjakan > 0 && <span className="font-medium text-blue-700">{session.mengerjakan} mengerjakan</span>}
                    {session.waktuHabis > 0 && <span className="font-medium text-amber-800">{session.waktuHabis} waktu habis</span>}
                    <span className="font-semibold text-slate-700">{session.mengirim}/{total} terkumpul</span>
                </span>
            </div>
            <div role="progressbar" aria-label={'Pengumpulan ' + session.judul} aria-valuemin={0} aria-valuemax={total || 1}
                aria-valuenow={session.mengirim} aria-valuetext={session.mengirim + ' dari ' + total + ' peserta sudah mengumpulkan'}
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: progress + '%' }} />
            </div>
        </summary>
        <div className="border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 p-4 sm:px-5">
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                    <span>Belum mulai <strong className="ml-1 tabular-nums">{session.belumMulai}</strong></span>
                    <span>Mengerjakan <strong className="ml-1 tabular-nums text-blue-700">{session.mengerjakan}</strong></span>
                    <span>Terkumpul <strong className="ml-1 tabular-nums text-emerald-700">{session.mengirim}</strong></span>
                    <span>Waktu habis <strong className="ml-1 tabular-nums text-amber-800">{session.waktuHabis}</strong></span>
                </div>
                {total > 0 && <div className="relative w-full sm:w-64">
                    <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="search" className="ui-input w-full pl-9" aria-label={'Cari peserta ' + session.judul}
                        placeholder="Cari nama atau NIS…" value={query} onChange={event => setQuery(event.target.value)} />
                </div>}
            </div>
            {participants.length > 0 ? <div className="max-h-96 overflow-auto">
                <table className="ui-table min-w-[400px]">
                    <thead className="sticky top-0 z-10"><tr>
                        {['Peserta', 'Status', 'Batas waktu'].map(label => <th scope="col" key={label}>{label}</th>)}
                    </tr></thead>
                    <tbody>{participants.map(student => <tr key={student.id}>
                        <td><p className="font-medium text-slate-800">{student.nama || '—'}</p><p className="mt-0.5 font-mono text-xs text-slate-500">NIS {student.username}</p></td>
                        <td><span className={'ui-badge whitespace-nowrap ' + (statusStyles[student.status] ?? statusStyles.Selesai)}>{statusLabel(student.status)}</span></td>
                        <td className="whitespace-nowrap tabular-nums text-slate-500">{student.batasWaktu
                            ? <time dateTime={student.batasWaktu} title={fullDateFormat.format(new Date(student.batasWaktu))}
                                aria-label={fullDateFormat.format(new Date(student.batasWaktu))}>{timeFormat.format(new Date(student.batasWaktu))}</time> : '—'}</td>
                    </tr>)}</tbody>
                </table>
            </div> : <p className="p-6 text-center text-sm text-slate-500">{keyword ? 'Peserta tidak ditemukan.' : 'Belum ada peserta.'}</p>}
        </div>
    </details>;
}

export default function MonitoringUjian() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [updated, setUpdated] = useState<Date | null>(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [kind, setKind] = useState('');
    const [query, setQuery] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [refreshing, setRefreshing] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        let next: ReturnType<typeof setTimeout>;
        async function refresh() {
            setRefreshing(true);
            try {
                const { data } = await api.get<{ data: Session[] }>('/admin/ujian', { signal: controller.signal, timeout: 10000 });
                if (controller.signal.aborted) return;
                setSessions(data.data);
                setUpdated(new Date());
                setError('');
            } catch {
                if (!controller.signal.aborted) setError('Pembaruan gagal. Coba muat ulang.');
            } finally {
                if (!controller.signal.aborted) { setRefreshing(false); next = setTimeout(refresh, 15000); }
            }
        }
        void refresh();
        return () => { controller.abort(); clearTimeout(next); };
    }, [refreshKey]);

    const keyword = query.trim().toLocaleLowerCase('id-ID');
    const rank: Record<string, number> = { Berlangsung: 0, Terjadwal: 1, Selesai: 2 };
    const visible = sessions.filter(session => (!filter || session.status === filter) && (!kind || session.jenis === kind) &&
        (session.judul + ' ' + session.mapel + ' ' + session.kelas).toLocaleLowerCase('id-ID').includes(keyword))
        .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
            (a.status === 'Selesai' ? +new Date(b.mulai) - +new Date(a.mulai) : +new Date(a.mulai) - +new Date(b.mulai)));
    const ongoing = sessions.filter(session => session.status === 'Berlangsung');
    const stats = [
        { label: 'Sesi aktif', value: ongoing.length, icon: MonitorCheck, color: 'bg-blue-50 text-blue-700' },
        { label: 'Mengerjakan', value: ongoing.reduce((sum, session) => sum + session.mengerjakan, 0), icon: Users, color: 'bg-blue-50 text-blue-700' },
        { label: 'Terkumpul', value: ongoing.reduce((sum, session) => sum + session.mengirim, 0), icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' }
    ];

    return <section className="ui-content space-y-5">
        <header className="ui-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-8">
            <div><h1 className="ui-page-title flex items-center gap-2.5"><MonitorCheck size={28} className="shrink-0 text-blue-600" aria-hidden="true" />Monitoring Ujian</h1>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500" title="Diperbarui otomatis setiap 15 detik">
                    <span aria-hidden="true" className={'size-1.5 rounded-full ' + (error ? 'bg-amber-500' : 'bg-emerald-500')} />
                    {updated ? 'Pembaruan ' + updated.toLocaleTimeString('id-ID') : 'Pembaruan otomatis'}
                </p>
            </div>
            <button type="button" disabled={refreshing} onClick={() => setRefreshKey(value => value + 1)}
                className="ui-button ui-button-secondary" aria-label="Muat ulang monitoring" title="Muat ulang">
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" /><span>{refreshing ? 'Memuat…' : 'Muat ulang'}</span>
            </button>
        </header>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        <div aria-label="Ringkasan sesi berlangsung" className="grid grid-cols-3 gap-3 sm:gap-4">
            {stats.map(({ label, value, icon: Icon, color }) => <div key={label} className="ui-card flex items-center gap-3 p-3 sm:p-5">
                <span className={'hidden size-10 shrink-0 place-items-center rounded-xl sm:grid ' + color}><Icon size={20} aria-hidden="true" /></span>
                <div className="min-w-0"><p className="text-2xl font-bold tabular-nums text-slate-800">{updated ? value : '—'}</p><p className="mt-1 text-xs text-slate-500 sm:text-sm">{label}</p></div>
            </div>)}
        </div>
        <div className="ui-card flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <div className="relative min-w-0 w-full sm:mr-auto sm:w-72">
                <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input type="search" className="ui-input w-full pl-10" placeholder="Cari ujian, mapel, atau kelas…" aria-label="Cari ujian, mapel, atau kelas"
                    value={query} onChange={event => setQuery(event.target.value)} />
            </div>
            <Select aria-label="Status ujian" value={filter} onValueChange={setFilter} className="min-w-0 flex-1 sm:flex-none">
                <option value="">Semua status</option><option>Terjadwal</option><option>Berlangsung</option><option>Selesai</option>
            </Select>
            <Select aria-label="Jenis sesi" value={kind} onValueChange={setKind} className="min-w-0 flex-1 sm:flex-none">
                <option value="">Semua sesi</option><option>Reguler</option><option>Susulan</option>
            </Select>
        </div>
        <div className="flex items-center justify-between px-1"><h2 className="text-sm font-semibold text-slate-700">Daftar sesi</h2>
            <span className="text-xs tabular-nums text-slate-500">{updated ? visible.length + ' sesi' : '—'}</span></div>
        {!updated && !error && <p role="status" className="ui-card p-8 text-center text-sm text-slate-500">Memuat sesi ujian…</p>}
        {updated && !visible.length && <div className="ui-card space-y-3 p-8 text-center">
            <MonitorCheck size={32} className="mx-auto text-slate-300" aria-hidden="true" />
            <p className="text-sm text-slate-500">{filter || kind || keyword ? 'Tidak ada sesi yang cocok.' : 'Belum ada ujian.'}</p>
            {(filter || kind || query) && <button type="button" className="ui-button ui-button-secondary" onClick={() => { setFilter(''); setKind(''); setQuery(''); }}>Reset filter</button>}
        </div>}
        <div className="space-y-3">{visible.map(session => <SessionCard key={session.id} session={session} />)}</div>
    </section>;
}

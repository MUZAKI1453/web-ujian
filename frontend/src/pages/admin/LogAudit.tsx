import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import api from '../../services/api';
import { PortalHeader } from '../../components/PortalHeader';

type Row = {
    id: number; waktu: string; pelaku: string | null; peran: string | null; aksi: string;
    target: string | null; status: number; ip: string | null; userAgent: string | null;
};
type Page = { total: number; halaman: number; ukuran: number; data: Row[] };

const timeFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
const filters = [{ value: '', label: 'Semua' }, { value: 'login', label: 'Login' }, { value: 'gagal', label: 'Gagal / ditolak' }];
const labels: Record<string, string> = { login: 'Login', 'login-gagal': 'Login gagal', logout: 'Keluar', 'ganti-password': 'Ganti password' };

export default function LogAudit() {
    const [page, setPage] = useState<Page | null>(null);
    const [number, setNumber] = useState(1);
    const [kind, setKind] = useState('');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => { setSearch(query.trim()); setNumber(1); }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const controller = new AbortController();
        api.get<Page>('/admin/audit', { signal: controller.signal, params: { halaman: number, jenis: kind || undefined, cari: search || undefined } })
            .then(({ data }) => { setPage(data); setError(''); })
            .catch(() => { if (!controller.signal.aborted) setError('Log audit belum dapat dimuat. Coba lagi.'); });
        return () => controller.abort();
    }, [number, kind, search]);

    const pages = page ? Math.max(1, Math.ceil(page.total / page.ukuran)) : 1;
    return <section className="cbt-portal">
        <PortalHeader title="Log Audit" label="Keamanan" subtitle="Jejak login serta perubahan data oleh admin dan guru. Disimpan 180 hari." icon={ScrollText} />
        <div className="ui-card space-y-4 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Saring log">
                    {filters.map(item => <button key={item.value} type="button" aria-pressed={kind === item.value}
                        className={'ui-button ' + (kind === item.value ? 'ui-button-primary' : 'ui-button-secondary')}
                        onClick={() => { setKind(item.value); setNumber(1); }}>{item.label}</button>)}
                </div>
                <div className="relative w-full sm:w-72">
                    <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="search" className="ui-input w-full pl-9" aria-label="Cari log audit" placeholder="Cari pengguna, aksi, atau IP…"
                        value={query} onChange={event => setQuery(event.target.value)} />
                </div>
            </div>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {!page && !error && <p role="status" className="text-sm text-slate-600">Memuat log audit…</p>}
            {page && (page.data.length ? <div className="overflow-x-auto">
                <table className="ui-table min-w-[820px]">
                    <thead><tr>{['Waktu', 'Pengguna', 'Aksi', 'Status', 'IP & perangkat'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                    <tbody>{page.data.map(row => <tr key={row.id}>
                        <td className="whitespace-nowrap tabular-nums text-slate-600">{timeFormat.format(new Date(row.waktu))}</td>
                        <td><p className="font-medium text-slate-800">{row.pelaku || '—'}</p><p className="mt-0.5 text-xs text-slate-500">{row.peran || 'tidak dikenal'}</p></td>
                        <td className="min-w-[15rem]"><p className="break-words font-medium text-slate-800">{labels[row.aksi] ?? row.aksi}</p>
                            {row.target && <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{row.target}</p>}</td>
                        <td><span className={'ui-badge ' + (row.status >= 400 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800')}>{row.status}</span></td>
                        <td><p className="font-mono text-xs text-slate-700">{row.ip || '—'}</p>
                            <p className="mt-0.5 max-w-[11rem] truncate text-xs text-slate-500" title={row.userAgent ?? undefined}>{row.userAgent || '—'}</p></td>
                    </tr>)}</tbody>
                </table>
            </div> : <p className="p-6 text-center text-sm text-slate-500">Tidak ada catatan yang cocok.</p>)}
            {page && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                <span>{page.total} catatan · halaman {page.halaman} dari {pages}</span>
                <span className="flex gap-2">
                    <button type="button" className="ui-button ui-button-secondary" disabled={number <= 1} onClick={() => setNumber(number - 1)}>Sebelumnya</button>
                    <button type="button" className="ui-button ui-button-secondary" disabled={number >= pages} onClick={() => setNumber(number + 1)}>Berikutnya</button>
                </span>
            </div>}
        </div>
    </section>;
}

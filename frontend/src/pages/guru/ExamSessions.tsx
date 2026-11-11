import { useConfirmation } from '../../components/ConfirmationProvider';
import { fieldClass, primaryClass } from '../../components/ui/styles';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Archive, CalendarDays, ChevronDown, LockKeyhole, Monitor, Plus, RefreshCw, RotateCcw, Save, Search, ShieldAlert, Square, UnlockKeyhole, X } from 'lucide-react';
import Select from '../../components/ui/Select';
import ModalOverlay from '../../components/ModalOverlay';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import { violationLabels } from '../siswa/useExamSecurity';
import type { SecurityWeights } from '../siswa/attemptStore';
import type { ExamProfile } from './examProfiles';
import { participantStatus, sessionExpanded } from './sessionStatus';
import { defaultExamSchedule, localDateTime } from './examDateFilter';

type Student = { id: number; nama: string | null; username: string; role?: string };
type Window = { token: string | null; masukBuka: boolean; waktuMulai: string; waktuSelesai: string };
type Makeup = Window & { id: number; peserta: { siswaId: number; siswa: Student }[] };
type Attempt = { id: number; siswaId: number; sesiSusulanId: number | null; mulai: string; batasWaktu: string; waktuKirim: string | null; siswa: Student };
type Answer = { siswaId: number; totalNilai: string; waktuSubmit: string; siswa: Student };
type Sessions = Window & { profil: ExamProfile; durasiMenit: number; jadwalTerkunci: boolean; kelas: { users: Student[] }; pesertaUjiCoba: Student[]; susulan: Makeup[]; pengerjaan: Attempt[]; jawaban: Answer[];
    bobotKeamanan: SecurityWeights; batasPelanggaran: number;
    keamanan?: { id: number; siswaId: number; attemptId: number; reason: keyof typeof violationLabels; waktu: string; bobot: number; dibatalkan?: { alasan: string; waktu: string | null } | null }[] };

const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const formatted = (value: string) => date.format(new Date(value));
const stateColors: Record<string, string> = {
    Terjadwal: 'bg-slate-100 text-slate-600', Berlangsung: 'bg-blue-50 text-blue-700', Selesai: 'bg-green-50 text-green-700',
    'Belum mulai': 'bg-slate-100 text-slate-600', Mengerjakan: 'bg-blue-50 text-blue-700',
    'Sudah mengirim': 'bg-green-50 text-green-700', 'Waktu habis': 'bg-yellow-100 text-yellow-900'
};
const badge = (state: string) => <span className={'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ' + stateColors[state]}>{state}</span>;

export default function ExamSessions({ examId, archived = false, archiving, onArchive, renderHeader }: {
    examId: number;
    archived?: boolean;
    archiving: boolean;
    onArchive: () => void;
    renderHeader: (action?: ReactNode) => ReactNode;
}) {
    const askConfirmation = useConfirmation();
    const [data, setData] = useState<Sessions | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [making, setMaking] = useState<ReturnType<typeof defaultExamSchedule> | null>(null);
    const [rescheduling, setRescheduling] = useState(false);
    const [notice, setNotice] = useState('');
    const [projection, setProjection] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, { status: string; open: boolean }>>({});
    const [searches, setSearches] = useState<Record<string, string>>({});
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [now, setNow] = useState(Date.now);
    const [makeupSearch, setMakeupSearch] = useState('');
    const [chosen, setChosen] = useState<number[]>([]);
    const [cancelling, setCancelling] = useState<{ id: number; label: string; student: string } | null>(null);
    const url = '/guru/ujian/' + examId;
    const refresh = useCallback(async (signal?: AbortSignal) => {
        const response = await api.get<Sessions>(url + '/sesi', { signal, timeout: 10000 });
        if (!signal?.aborted) { setData(response.data); setNow(Date.now()); }
    }, [url]);
    useEffect(() => {
        const controller = new AbortController();
        let next: ReturnType<typeof setTimeout>;
        async function poll() {
            try { await refresh(controller.signal); }
            catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
            if (!controller.signal.aborted) next = setTimeout(poll, 15000);
        }
        void poll();
        return () => { controller.abort(); clearTimeout(next); };
    }, [refresh]);
    useEffect(() => {
        if (!data) return;
        const current = Date.now();
        const boundaries = [data, ...data.susulan].flatMap(session => [+new Date(session.waktuMulai), +new Date(session.waktuSelesai)]).filter(time => time > current);
        if (!boundaries.length) return;
        const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.min(...boundaries) - current + 10, 2147483647));
        return () => clearTimeout(timer);
    }, [data, now]);
    async function perform(action: () => Promise<unknown>) {
        setBusy(true); setError(''); setNotice('');
        try { await action(); await refresh(); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }
    function reschedule(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !data || data.jadwalTerkunci) return;
        const form = new FormData(event.currentTarget);
        const start = new Date(String(form.get('mulai')));
        const end = new Date(String(form.get('selesai')));
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end - Math.max(Date.now(), +start) < data.durasiMenit * 60000) {
            setError('Sisa rentang jadwal harus cukup untuk durasi ujian.');
            return;
        }
        void perform(async () => {
            const { data: schedule } = await api.patch<Pick<Window, 'waktuMulai' | 'waktuSelesai'>>(url + '/jadwal', {
                waktuMulai: start.toISOString(), waktuSelesai: end.toISOString()
            });
            setData(current => current && { ...current, ...schedule });
            setRescheduling(false);
            setNotice('Jadwal sesi reguler diperbarui.');
        });
    }
    function makeup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        const start = new Date(String(form.get('mulai')));
        const end = new Date(String(form.get('selesai')));
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start) { setError('Waktu selesai harus setelah waktu mulai.'); return; }
        const participants = form.getAll('peserta').map(Number);
        if (!participants.length) { setError('Pilih minimal satu peserta.'); return; }
        void perform(async () => {
            await api.post(url + '/susulan', { waktuMulai: start.toISOString(), waktuSelesai: end.toISOString(), peserta: participants });
            setMaking(null); setChosen([]);
        });
    }
    if (!data) return <section className="space-y-4">{renderHeader()}<p role={error ? 'alert' : 'status'}>{error || 'Memuat sesi ujian…'}</p></section>;
    const attempts = new Map(data.pengerjaan.map(item => [item.siswaId, item]));
    const answers = new Map(data.jawaban.map(item => [item.siswaId, item]));
    const assigned = new Set(data.susulan.flatMap(item => item.peserta.map(p => p.siswaId)));
    const regular = new Map(data.kelas.users.filter(item => !assigned.has(item.id)).map(item => [item.id, item]));
    data.pengerjaan.filter(item => item.sesiSusulanId === null).forEach(item => regular.set(item.siswaId, item.siswa));
    data.jawaban.filter(item => attempts.get(item.siswaId)?.sesiSusulanId == null).forEach(item => regular.set(item.siswaId, item.siswa));
    const eligible = [...data.kelas.users, ...data.pesertaUjiCoba].filter(item => !assigned.has(item.id) && !attempts.has(item.id) && !answers.has(item.id));
    const sessions = [
        { ...data, key: 'reguler', title: 'Sesi Reguler', id: null, students: [...regular.values()] },
        ...data.susulan.map((item, index) => ({ ...item, key: String(item.id), title: 'Sesi Susulan ' + (index + 1), students: item.peserta.map(p => p.siswa) }))
    ];
    const projected = sessions.find(item => item.key === projection);
    const canArchive = !archived && sessions.every(session => +new Date(session.waktuSelesai) <= now);
    return <section className="space-y-4">
        <details className="ui-card space-y-3 p-4">
            <summary className="cursor-pointer font-semibold">Pengaturan risiko ujian</summary>
            <p className="text-sm text-slate-600">Bobot 0 menonaktifkan pencatatan kejadian. Skor risiko digunakan untuk tinjauan.</p>
            <p className="text-sm text-slate-600">Batas pelanggaran menentukan kapan jawaban dikumpulkan otomatis. Isi 0 agar pelanggaran hanya dicatat, misalnya untuk ujian di HP yang sering terganggu notifikasi.</p>
            {data.jadwalTerkunci && <p className="text-sm text-slate-600">Pengaturan terkunci setelah pengerjaan dimulai atau ujian diarsipkan.</p>}
            <form key={JSON.stringify([data.bobotKeamanan, data.batasPelanggaran])} onSubmit={event => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                const weights = Object.fromEntries(Object.keys(data.bobotKeamanan).map(reason => [reason, Number(fields.get(reason))]));
                void perform(() => api.patch(url + '/keamanan', { weights, limit: Number(fields.get('batas')) }));
            }}>
                <fieldset disabled={busy || data.jadwalTerkunci} className="grid gap-3 sm:grid-cols-2">
                    {(Object.keys(violationLabels) as (keyof SecurityWeights)[]).map(reason => <label key={reason} className="ui-label flex items-center justify-between gap-3">
                        {violationLabels[reason]}<input name={reason} type="number" min="0" max="10" step="1" required defaultValue={data.bobotKeamanan[reason]} className="ui-input w-20" />
                    </label>)}
                    <label className="ui-label flex items-center justify-between gap-3 sm:col-span-2">
                        Batas pelanggaran sebelum kumpul otomatis<input name="batas" type="number" min="0" max="10" step="1" required defaultValue={data.batasPelanggaran} className="ui-input w-20" />
                    </label>
                    <button type="submit" className={primaryClass}>Simpan pengaturan risiko</button>
                </fieldset>
            </form>
        </details>
        {error && !making && !rescheduling && !cancelling && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
        {renderHeader(!archived && <>
            <button type="button" disabled={busy || archiving || !eligible.length} title={eligible.length ? 'Tambah sesi susulan' : 'Tidak ada peserta yang dapat ditambahkan ke sesi susulan'} className={primaryClass} onClick={() => { setError(''); setChosen([]); setMakeupSearch(''); setMaking(defaultExamSchedule(data.durasiMenit)); }}><Plus size={17} aria-hidden="true" />Sesi Susulan</button>
            {canArchive && <button type="button" disabled={busy || archiving} className="ui-button ui-button-neutral-soft" onClick={onArchive}><Archive size={16} aria-hidden="true" />Arsipkan Ujian</button>}
        </>)}
        {sessions.map(session => {
            const ongoing = +new Date(session.waktuSelesai) > now;
            const status = !ongoing ? 'Selesai' : +new Date(session.waktuMulai) > now ? 'Terjadwal' : 'Berlangsung';
            const canReschedule = session.id === null && !archived && !data.jadwalTerkunci;
            const open = sessionExpanded(status, expanded[session.key]);
            const search = searches[session.key] ?? '';
            const filter = filters[session.key] ?? 'all';
            const participants = session.students.map(student => {
                const attempt = attempts.get(student.id);
                const attemptHere = attempt?.sesiSusulanId === session.id ? attempt : undefined;
                const answer = (attempt?.sesiSusulanId ?? null) === session.id ? answers.get(student.id) : undefined;
                return { student, attempt: attemptHere, answer, state: participantStatus(attemptHere, !!answer, session.waktuSelesai, now),
                    violations: (data.keamanan ?? []).filter(item => item.attemptId === attemptHere?.id) };
            });
            const keyword = search.trim().toLowerCase();
            const visible = participants.filter(({ student, state }) => (filter === 'all' || state === filter) && ((student.nama ?? '') + ' ' + student.username).toLowerCase().includes(keyword));
            async function controls(action: string) {
                if (action === 'akhiri' && !await askConfirmation({ title: 'Akhiri sesi ujian?', message: 'Peserta tidak bisa melanjutkan pengerjaan setelah sesi diakhiri.', confirmLabel: 'Akhiri Sesi', tone: 'danger' })) return;
                void perform(() => api.patch(url + '/sesi/' + session.key, { aksi: action }));
            }
            return <details key={session.key} open={open} onToggle={event => {
                const nextOpen = event.currentTarget.open;
                setExpanded(current => current[session.key]?.status === status && current[session.key]?.open === nextOpen ? current : { ...current, [session.key]: { status, open: nextOpen } });
            }} className="ui-card overflow-hidden bg-white">
            <summary className="monitor-session-summary flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
                <div><h3 className="text-base font-semibold text-slate-900">{session.title}</h3><p className="mt-1 flex items-center gap-2 text-xs leading-relaxed text-slate-500"><CalendarDays size={15} className="shrink-0" aria-hidden="true" />{formatted(session.waktuMulai)} – {formatted(session.waktuSelesai)}</p></div>
                <div className="flex flex-wrap gap-2">{badge(status)}<span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ' + (session.masukBuka && ongoing ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                    {session.masukBuka && ongoing ? <UnlockKeyhole size={13} aria-hidden="true" /> : <LockKeyhole size={13} aria-hidden="true" />}{session.masukBuka && ongoing ? 'Akses terbuka' : 'Akses tertutup'}
                </span><ChevronDown size={19} className={'self-center text-slate-500 transition-transform ' + (open ? 'rotate-180' : '')} aria-hidden="true" /></div>
            </summary>
            <div className="space-y-4 border-t border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div><p className="text-xs font-medium text-slate-500">Token ujian</p><strong className="mt-1 block text-lg text-slate-900">{session.token || 'Tanpa token'}</strong></div>
                {(ongoing || canReschedule) && <div className="flex flex-wrap gap-2">
                    {canReschedule && <button type="button" disabled={busy || archiving} className="ui-button ui-button-edit" onClick={() => { setError(''); setRescheduling(true); }}><CalendarDays size={16} aria-hidden="true" />Ubah Jadwal</button>}
                    {ongoing && <>
                    {session.token && <button type="button" className="ui-button ui-button-secondary bg-white" onClick={() => setProjection(session.key)}><Monitor size={16} aria-hidden="true" />Tampilkan Token</button>}
                    {data.profil !== 'latihan-kuis' && <button type="button" disabled={busy} className="ui-button ui-button-secondary bg-white" onClick={() => controls('ganti-token')}><RefreshCw size={16} aria-hidden="true" />{session.token ? 'Ganti Token' : 'Aktifkan Token'}</button>}
                    {data.profil === 'ulangan-harian' && session.token && <button type="button" disabled={busy} className="ui-button ui-button-secondary bg-white" onClick={async () => {
                        if (await askConfirmation({ title: 'Nonaktifkan token?', message: 'Peserta yang memenuhi syarat bisa masuk tanpa token selama akses sesi terbuka.', confirmLabel: 'Nonaktifkan Token', tone: 'warning' })) void controls('hapus-token');
                    }}>Nonaktifkan Token</button>}
                    <button type="button" disabled={busy} className="ui-button ui-button-secondary bg-white" onClick={() => controls(session.masukBuka ? 'tutup' : 'buka')}>
                        {session.masukBuka ? <LockKeyhole size={16} aria-hidden="true" /> : <UnlockKeyhole size={16} aria-hidden="true" />}{session.masukBuka ? 'Tutup Akses' : 'Buka Akses'}
                    </button>
                    {status === 'Berlangsung' && <button type="button" disabled={busy} className="ui-button border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={() => void controls('akhiri')}><Square size={15} aria-hidden="true" />Akhiri Sesi</button>}
                    </>}
                </div>}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[['Peserta', participants.length], ['Mengerjakan', participants.filter(item => item.state === 'Mengerjakan').length], ['Sudah mengirim', participants.filter(item => item.state === 'Sudah mengirim').length], ['Belum mulai', participants.filter(item => item.state === 'Belum mulai').length]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-xl text-slate-900">{value}</strong></div>)}
            </div>
        <section className="ui-card overflow-hidden bg-white" aria-label="Daftar peserta sesi">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-slate-900">Daftar Peserta <span className="ml-1 text-xs font-normal text-slate-500">{visible.length}/{participants.length}</span></h3>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <div className="relative min-w-0 flex-1 sm:w-60"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} aria-label={'Cari peserta ' + session.title} placeholder="Cari nama atau NIS…" onChange={event => setSearches(current => ({ ...current, [session.key]: event.target.value }))} className="ui-input w-full pl-9" /></div>
                    <Select aria-label={'Filter status peserta ' + session.title} value={filter} onValueChange={value => setFilters(current => ({ ...current, [session.key]: value }))}><option value="all">Semua status</option>{['Belum mulai', 'Mengerjakan', 'Sudah mengirim', 'Waktu habis'].map(state => <option key={state}>{state}</option>)}</Select>
                </div>
            </div>
            {!visible.length ? <p className="p-8 text-center text-sm text-slate-500">{participants.length ? 'Tidak ada peserta yang cocok.' : 'Belum ada peserta di sesi ini.'}</p> : <div className="overflow-x-auto">
                <table className="ui-table"><thead><tr>{['Siswa', 'Status', 'Keamanan', 'Nilai', 'Aksi'].map(label => <th key={label} scope="col" className="whitespace-nowrap">{label}</th>)}</tr></thead>
                    <tbody>{visible.map(({ student, attempt, answer, state, violations }) => <tr key={student.id}>
                        <td><span className="block font-semibold text-slate-800">{student.nama || student.username}</span><span className="text-xs text-slate-500">NIS {student.username}</span></td><td>{badge(state)}</td>
                        <td>{violations.length ? <details className="group min-w-36">
                            <summary className="monitor-session-summary flex min-h-10 cursor-pointer list-none items-center gap-2 text-yellow-900"><ShieldAlert size={16} aria-hidden="true" /><span className="text-xs font-semibold">Risiko {violations.reduce((sum, item) => sum + (item.dibatalkan ? 0 : item.bobot), 0)} · {violations.filter(item => !item.dibatalkan).length} kejadian{violations.some(item => item.dibatalkan) && ` · ${violations.filter(item => item.dibatalkan).length} dibatalkan`}</span><ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                            <ul className="mt-2 space-y-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs">{violations.map(item => <li key={item.id}>
                                <span className={item.dibatalkan ? 'text-slate-500 line-through' : undefined}>{violationLabels[item.reason] || item.reason}</span>
                                <span className="mt-1 block text-slate-500">{formatted(item.waktu)} · Bobot {item.bobot}</span>
                                {item.dibatalkan ? <span className="mt-1 block break-words text-slate-600">Dibatalkan: {item.dibatalkan.alasan}</span>
                                    : !archived && <button type="button" disabled={busy} className="mt-1 font-semibold text-blue-700 underline disabled:opacity-40"
                                        onClick={() => setCancelling({ id: item.id, label: violationLabels[item.reason] || item.reason, student: student.nama || student.username })}>Batalkan</button>}
                            </li>)}</ul>
                        </details> : <span className="text-xs text-slate-500">{attempt ? 'Risiko 0' : '—'}</span>}</td>
                        <td className="font-semibold tabular-nums">{answer ? Number(answer.totalNilai) : '—'}</td>
                        <td>{!archived && (attempt || answer) && <button type="button" disabled={busy} title="Reset pengerjaan" aria-label={'Reset pengerjaan ' + (student.nama || student.username)} className="grid size-10 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40" onClick={async () => {
                            if (await askConfirmation({ title: 'Reset pengerjaan?', message: `Pengerjaan dan jawaban ${student.nama || student.username} akan dihapus.`, confirmLabel: 'Reset Pengerjaan', tone: 'danger' })) void perform(() => api.delete(url + '/pengerjaan/' + student.id));
                        }}><RotateCcw size={17} aria-hidden="true" /></button>}</td>
                    </tr>)}</tbody>
                </table>
            </div>}
        </section>
            </div>
        </details>;
        })}
        {projected && <dialog ref={element => { if (element && !element.open) element.showModal(); }} onCancel={event => { event.preventDefault(); setProjection(null); }} className="w-[min(95vw,50rem)] rounded-2xl p-6 text-center text-slate-800 backdrop:bg-slate-900/50 sm:p-8" aria-label="Token ujian">
            <div className="flex items-center justify-between gap-3"><p className="font-semibold">{projected.title}</p><button type="button" onClick={() => setProjection(null)} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup token"><X size={20} aria-hidden="true" /></button></div>
            <p className="my-8 break-all font-mono text-[clamp(2rem,12vw,7rem)] font-bold tracking-wider text-blue-800">{projected.token}</p>
        </dialog>}
        {cancelling && <ModalOverlay label="Batalkan pelanggaran" onClose={() => { if (!busy) setCancelling(null); }}>
            <form className="ui-dialog-panel max-w-lg space-y-4" onSubmit={event => {
                event.preventDefault();
                const alasan = String(new FormData(event.currentTarget).get('alasan') ?? '');
                void perform(async () => { await api.patch(url + '/pelanggaran/' + cancelling.id, { alasan }); setCancelling(null); });
            }}>
                <h3 className="text-lg font-bold">Batalkan pelanggaran</h3>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <p className="text-sm text-slate-600">{cancelling.student} · {cancelling.label}. Kejadian tetap tercatat, tetapi tidak dihitung lagi sebagai pelanggaran dan skor risiko. Pengerjaan yang sudah dikumpulkan otomatis tidak dibuka kembali.</p>
                <label className="ui-label block">Alasan pembatalan
                    <textarea name="alasan" required minLength={5} maxLength={300} rows={3} className={fieldClass} placeholder="Contoh: telepon masuk, disaksikan pengawas ruang." />
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" disabled={busy} className="ui-button ui-button-secondary" onClick={() => setCancelling(null)}>Batal</button>
                    <button type="submit" disabled={busy} className={primaryClass}>Batalkan Pelanggaran</button>
                </div>
            </form>
        </ModalOverlay>}
        {rescheduling && <ModalOverlay label="Ubah jadwal sesi reguler" onClose={() => { if (!busy) setRescheduling(false); }}>
            <section className="ui-dialog-panel max-w-xl space-y-4">
                <h3 className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={20} className="text-blue-700" aria-hidden="true" />Ubah Jadwal Reguler</h3>
                <p className="text-sm text-slate-600">Durasi ujian {data.durasiMenit} menit.</p>
                {data.jadwalTerkunci && <p role="status" className="ui-notice">Jadwal ujian sudah terkunci.</p>}
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <form onSubmit={reschedule} className="space-y-4">
                    <fieldset disabled={busy || data.jadwalTerkunci} className="grid gap-3 sm:grid-cols-2">
                        <label className="ui-label">Waktu mulai<input type="datetime-local" name="mulai" defaultValue={localDateTime(data.waktuMulai)} step="1" required className={fieldClass} /></label>
                        <label className="ui-label">Waktu selesai<input type="datetime-local" name="selesai" defaultValue={localDateTime(data.waktuSelesai)} step="1" required className={fieldClass} /></label>
                    </fieldset>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        <button type="button" disabled={busy} className="ui-button ui-button-secondary" onClick={() => setRescheduling(false)}>Batal</button>
                        <button type="submit" disabled={busy || data.jadwalTerkunci} className={primaryClass}><Save size={17} aria-hidden="true" />{busy ? 'Menyimpan…' : 'Simpan Jadwal'}</button>
                    </div>
                </form>
            </section>
        </ModalOverlay>}
        {making && <ModalOverlay label="Tambah Sesi Susulan" onClose={() => { if (!busy) setMaking(null); }}>
            <section className="ui-dialog-panel max-w-2xl space-y-5">
                <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={20} className="text-blue-700" aria-hidden="true" />Sesi Susulan</h3><button type="button" disabled={busy} onClick={() => setMaking(null)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup form sesi susulan"><X size={18} aria-hidden="true" /></button></div>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <form onSubmit={makeup} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2"><label className="ui-label">Mulai<input type="datetime-local" name="mulai" defaultValue={making.start} required className={fieldClass} /></label><label className="ui-label">Selesai<input type="datetime-local" name="selesai" defaultValue={making.end} required className={fieldClass} /></label></div>
                    <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">Peserta <span className="font-normal text-slate-500">· {chosen.filter(id => eligible.some(student => student.id === id)).length} dipilih</span></legend>
                        <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={makeupSearch} onChange={event => setMakeupSearch(event.target.value)} className="ui-input w-full pl-9" aria-label="Cari peserta susulan" placeholder="Cari nama atau NIS…" /></div>
                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">{eligible.map(student => <label key={student.id} className={(((student.nama ?? '') + ' ' + student.username).toLowerCase().includes(makeupSearch.trim().toLowerCase()) ? 'flex ' : 'hidden ') + 'cursor-pointer items-center gap-3 rounded-xl border p-3 ' + (chosen.includes(student.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                            <input type="checkbox" name="peserta" value={student.id} checked={chosen.includes(student.id)} className="size-5 accent-blue-600" onChange={event => setChosen(current => event.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))} />
                            <span className="min-w-0"><span className="block text-sm font-semibold">{student.nama || student.username}</span><span className="text-xs text-slate-500">{student.role === 'admin' ? 'Admin uji coba · ' : 'NIS '}{student.username}</span></span>
                        </label>)}
                        {!eligible.some(student => ((student.nama ?? '') + ' ' + student.username).toLowerCase().includes(makeupSearch.trim().toLowerCase())) && <p className="py-5 text-center text-sm text-slate-500">Tidak ada peserta yang cocok.</p>}</div>
                    </fieldset>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className="ui-button ui-button-secondary" onClick={() => setMaking(null)}>Batal</button><button type="submit" disabled={!eligible.some(student => chosen.includes(student.id))} className={primaryClass}><Save size={17} aria-hidden="true" />{busy ? 'Menyimpan…' : 'Simpan Sesi'}</button></div>
                </fieldset></form>
            </section>
        </ModalOverlay>}
    </section>;
}

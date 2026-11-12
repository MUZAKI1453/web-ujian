import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Eye, KeyRound, LockKeyhole, NotebookPen, Search, ShieldAlert, UnlockKeyhole, Wifi, WifiOff } from 'lucide-react';
import api from '../../services/api';
import ModalOverlay from '../../components/ModalOverlay';
import StudentPasswordDialog from '../../components/StudentPasswordDialog';
import { fieldClass, primaryClass } from '../../components/ui/styles';
import { backLayer, useBackHandler } from '../../components/ui/useBackHandler';
import { errorMessage } from './QuestionEditor';
import { participantStatus } from './sessionStatus';
import { violationLabels } from '../siswa/useExamSecurity';

type ExamRow = { id: number; judul: string; mapel: string; waktuMulai: string; waktuSelesai: string; kelas: string[]; status: string };
type Session = { key: string; jenis: string; token: string | null; masukBuka: boolean; waktuMulai: string; waktuSelesai: string };
type Violation = { id: number; reason: keyof typeof violationLabels; waktu: string; dibatalkan: { alasan: string } | null };
type Participant = {
    id: number; nama: string | null; username: string; kelas: string; sesi: string;
    attemptId: number | null; batasWaktu: string | null; waktuKirim: string | null; terkirim: boolean;
    terisi: number; kontakTerakhir: number | null; jumlahPelanggaran: number; pelanggaran: Violation[];
};
type Panel = {
    id: number; judul: string; mapel: string; jumlahSoal: number; batasPelanggaran: number; now: number;
    kelas: { id: number; namaKelas: string }[]; sesi: Session[]; peserta: Participant[];
    catatan: { id: number; teks: string; waktu: string; oleh: string }[];
};

const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const clock = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' });
const stateColors: Record<string, string> = {
    Terjadwal: 'bg-slate-100 text-slate-600', Berlangsung: 'bg-blue-50 text-blue-700', Selesai: 'bg-green-50 text-green-700',
    'Belum mulai': 'bg-slate-100 text-slate-600', Mengerjakan: 'bg-blue-50 text-blue-700',
    'Sudah mengirim': 'bg-green-50 text-green-700', 'Waktu habis': 'bg-yellow-100 text-yellow-900'
};
const badge = (label: string) => <span className={'cbt-badge ' + (stateColors[label] ?? 'bg-slate-100 text-slate-600')}>{label}</span>;

// Panel untuk guru yang ditugaskan mengawasi ujian. Server hanya mengirim peserta kelas yang diawasi,
// tanpa soal, kunci, jawaban, dan nilai.
export default function PengawasUjian() {
    const [exams, setExams] = useState<ExamRow[] | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [panel, setPanel] = useState<Panel | null>(null);
    const [offset, setOffset] = useState(0);
    const [now, setNow] = useState(Date.now);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('semua');
    const [cancelling, setCancelling] = useState<{ id: number; label: string; student: string } | null>(null);
    const [passwordOf, setPasswordOf] = useState<Participant | null>(null);

    useBackHandler(selected !== null, () => setSelected(null), backLayer.detail);

    useEffect(() => {
        if (selected !== null) return;
        const controller = new AbortController();
        api.get<{ data: ExamRow[] }>('/pengawas/ujian', { signal: controller.signal })
            .then(({ data }) => setExams(data.data))
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
        return () => controller.abort();
    }, [selected]);

    const refresh = useCallback(async (id: number, signal?: AbortSignal) => {
        const { data } = await api.get<Panel>('/pengawas/ujian/' + id, { signal });
        if (signal?.aborted) return;
        setPanel(data);
        setOffset(data.now - Date.now());
    }, []);

    useEffect(() => {
        setPanel(null); setSearch(''); setFilter('semua'); setNotice(''); setError('');
        if (selected === null) return;
        const controller = new AbortController();
        const load = () => refresh(selected, controller.signal).catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
        void load();
        // Jeda acak agar banyak pengawas tidak memuat serentak; berhenti saat tab tidak terlihat.
        const poll = setInterval(() => { if (!document.hidden) void load(); }, 5000 + Math.random() * 2000);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { controller.abort(); clearInterval(poll); clearInterval(tick); };
    }, [selected, refresh]);

    async function perform(action: () => Promise<unknown>, done: string) {
        if (selected === null) return;
        setBusy(true); setError(''); setNotice('');
        try { await action(); await refresh(selected); setNotice(done); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    if (selected === null) return <section className="cbt-portal">
        <header className="ui-card space-y-2 p-5 sm:p-8">
            <h1 className="ui-page-title flex items-center gap-2.5"><Eye size={28} className="text-blue-600" aria-hidden="true" />Pengawasan</h1>
            <p className="text-sm text-slate-600">Ujian yang Anda awasi. Pengawas melihat kehadiran dan pelanggaran peserta, tanpa soal dan nilai.</p>
        </header>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {!exams && !error && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat daftar ujian…</p>}
        {exams && !exams.length && <p className="ui-card p-5 text-sm text-slate-600">Belum ada ujian yang ditugaskan kepada Anda. Penugasan diatur guru pemilik ujian atau admin di Sesi &amp; Peserta.</p>}
        {exams && exams.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{exams.map(exam => <article key={exam.id} className="ui-card flex min-w-0 flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs font-semibold text-blue-700">{exam.judul}</span>{badge(exam.status)}</div>
            <h2 className="break-words text-lg font-semibold">{exam.mapel}</h2>
            <p className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={16} aria-hidden="true" />{date.format(new Date(exam.waktuMulai))} – {clock.format(new Date(exam.waktuSelesai))}</p>
            <p className="text-sm text-slate-600">Kelas {exam.kelas.join(', ') || '—'}</p>
            <button type="button" className={primaryClass + ' mt-auto w-full'} onClick={() => setSelected(exam.id)}>Buka Panel Pengawas</button>
        </article>)}</div>}
    </section>;

    const serverNow = now + offset;
    const sessions = new Map(panel?.sesi.map(session => [session.key, session]));
    const rows = (panel?.peserta ?? []).map(student => {
        const session = sessions.get(student.sesi) ?? panel!.sesi[0];
        const state = participantStatus(student.attemptId && student.batasWaktu ? { waktuKirim: student.waktuKirim, batasWaktu: student.batasWaktu } : undefined,
            student.terkirim, session.waktuSelesai, serverNow);
        return { student, session, state };
    });
    const count = (state: string) => rows.filter(row => row.state === state).length;
    const keyword = search.trim().toLocaleLowerCase('id-ID');
    const visible = rows.filter(row => (filter === 'semua' || (filter === 'pelanggaran' ? row.student.jumlahPelanggaran > 0 : row.state === filter)) &&
        ((row.student.nama ?? '') + ' ' + row.student.username).toLocaleLowerCase('id-ID').includes(keyword));
    const filters = [['semua', 'Semua', rows.length], ['Belum mulai', 'Belum mulai', count('Belum mulai')], ['Mengerjakan', 'Mengerjakan', count('Mengerjakan')],
        ['Sudah mengirim', 'Terkumpul', count('Sudah mengirim')], ['Waktu habis', 'Waktu habis', count('Waktu habis')],
        ['pelanggaran', 'Ada pelanggaran', rows.filter(row => row.student.jumlahPelanggaran > 0).length]] as const;

    return <section className="cbt-portal">
        <header className="ui-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-blue-700"><Eye size={17} aria-hidden="true" />Panel Pengawas</p>
                <h1 className="ui-page-title break-words">{panel?.mapel ?? 'Memuat…'}</h1>
                {panel && <p className="mt-1 text-sm text-slate-600">{panel.judul} · Kelas {panel.kelas.map(item => item.namaKelas).join(', ')} · {panel.jumlahSoal} soal</p>}
            </div>
            <button type="button" className="ui-button ui-button-secondary self-start sm:self-auto" onClick={() => setSelected(null)}><ArrowLeft size={17} aria-hidden="true" />Kembali</button>
        </header>
        {error && !cancelling && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
        {!panel && !error && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat panel…</p>}
        {panel && <>
            <div className="grid gap-4 md:grid-cols-2">{panel.sesi.map(session => {
                const ended = +new Date(session.waktuSelesai) <= serverNow;
                const status = ended ? 'Selesai' : +new Date(session.waktuMulai) > serverNow ? 'Terjadwal' : 'Berlangsung';
                return <article key={session.key} className="ui-card space-y-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Sesi {session.jenis}</h2>{badge(status)}</div>
                    <p className="text-sm text-slate-600">{date.format(new Date(session.waktuMulai))} – {clock.format(new Date(session.waktuSelesai))}</p>
                    <div className="rounded-xl bg-slate-50 p-4 text-center">
                        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500"><KeyRound size={14} aria-hidden="true" />Token</p>
                        <p className="mt-1 select-all break-all font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">{session.token ?? '—'}</p>
                        {!session.token && <p className="text-xs text-slate-500">Sesi ini tanpa token.</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={'flex items-center gap-2 text-sm font-semibold ' + (session.masukBuka ? 'text-emerald-700' : 'text-slate-600')}>
                            {session.masukBuka ? <UnlockKeyhole size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}Akses masuk {session.masukBuka ? 'dibuka' : 'ditutup'}
                        </span>
                        {!ended && <button type="button" disabled={busy} className="ui-button ui-button-secondary"
                            onClick={() => void perform(() => api.patch('/pengawas/ujian/' + panel.id + '/sesi/' + session.key, { aksi: session.masukBuka ? 'tutup' : 'buka' }),
                                session.masukBuka ? 'Akses masuk ditutup. Siswa yang sudah mulai tetap bisa mengerjakan.' : 'Akses masuk dibuka.')}>
                            {session.masukBuka ? 'Tutup akses masuk' : 'Buka akses masuk'}</button>}
                    </div>
                </article>;
            })}</div>

            <div className="ui-card space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Saring peserta">{filters.map(([value, label, total]) =>
                    <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                        className={'rounded-full border px-3 py-1.5 text-xs font-semibold ' + (filter === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                        {label} · {total}</button>)}</div>
                <label className="relative block">
                    <span className="sr-only">Cari peserta</span>
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama atau NIS" className="ui-input w-full pl-9" />
                </label>
                {!visible.length ? <p className="p-6 text-center text-sm text-slate-500">{rows.length ? 'Tidak ada peserta yang cocok.' : 'Belum ada peserta di kelas yang Anda awasi.'}</p>
                    : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(({ student, state }) => {
                        const age = student.kontakTerakhir === null ? null : Math.max(0, serverNow - student.kontakTerakhir);
                        const online = age !== null && age < 90000;
                        return <li key={student.id} className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><p className="break-words font-semibold text-slate-800">{student.nama || student.username}</p>
                                    <p className="text-xs text-slate-500">NIS {student.username} · {student.kelas}</p></div>
                                {badge(state)}
                            </div>
                            <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 underline" onClick={() => setPasswordOf(student)}>
                                <KeyRound size={13} aria-hidden="true" />Lupa password?</button>
                            {student.attemptId !== null && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                                <span>Terisi {student.terisi}/{panel.jumlahSoal}</span>
                                {state === 'Mengerjakan' && <span className={'flex items-center gap-1 font-semibold ' + (online ? 'text-emerald-700' : 'text-amber-800')}>
                                    {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
                                    {online ? 'Tersambung' : age === null ? 'Belum ada kontak' : 'Terputus ' + Math.round(age / 60000) + ' mnt'}</span>}
                            </p>}
                            {student.pelanggaran.length > 0 && <details className="rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-xs">
                                <summary className="flex cursor-pointer items-center gap-2 font-semibold text-yellow-900"><ShieldAlert size={15} aria-hidden="true" />
                                    Pelanggaran {student.jumlahPelanggaran}{panel.batasPelanggaran > 0 && '/' + panel.batasPelanggaran} · {student.pelanggaran.length} catatan</summary>
                                <ul className="mt-2 space-y-2">{student.pelanggaran.map(item => <li key={item.id}>
                                    <span className={item.dibatalkan ? 'text-slate-500 line-through' : undefined}>{violationLabels[item.reason] || item.reason}</span>
                                    <span className="block text-slate-500">{clock.format(new Date(item.waktu))}</span>
                                    {item.dibatalkan ? <span className="block break-words text-slate-600">Dibatalkan: {item.dibatalkan.alasan}</span>
                                        : <button type="button" disabled={busy} className="font-semibold text-blue-700 underline disabled:opacity-40"
                                            onClick={() => { setError(''); setCancelling({ id: item.id, label: violationLabels[item.reason] || item.reason, student: student.nama || student.username }); }}>Batalkan</button>}
                                </li>)}</ul>
                            </details>}
                        </li>;
                    })}</ul>}
            </div>

            <div className="ui-card space-y-3 p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-semibold"><NotebookPen size={18} className="text-blue-700" aria-hidden="true" />Catatan kejadian</h2>
                <form className="space-y-2" onSubmit={event => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const teks = String(new FormData(form).get('teks') ?? '');
                    void perform(async () => { await api.post('/pengawas/ujian/' + panel.id + '/catatan', { teks }); form.reset(); }, 'Catatan disimpan.');
                }}>
                    <label className="ui-label block">Catatan untuk guru pemilik ujian
                        <textarea name="teks" required minLength={5} maxLength={500} rows={2} className={fieldClass} placeholder="Contoh: listrik padam 5 menit pukul 08.20, dua siswa pindah ke HP cadangan." />
                    </label>
                    <button type="submit" disabled={busy} className={primaryClass}>Simpan Catatan</button>
                </form>
                {panel.catatan.length > 0 && <ul className="space-y-2 border-t border-slate-200 pt-3 text-sm">{panel.catatan.map(note => <li key={note.id} className="rounded-lg bg-slate-50 p-3">
                    <p className="whitespace-pre-wrap break-words">{note.teks}</p>
                    <p className="mt-1 text-xs text-slate-500">{note.oleh} · {date.format(new Date(note.waktu))}</p>
                </li>)}</ul>}
            </div>
        </>}
        {passwordOf && panel && <StudentPasswordDialog path={'/pengawas/ujian/' + panel.id + '/siswa/' + passwordOf.id + '/sandi'}
            name={passwordOf.nama || passwordOf.username} nis={passwordOf.username} onClose={() => setPasswordOf(null)} />}
        {cancelling && panel && <ModalOverlay label="Batalkan pelanggaran" onClose={() => { if (!busy) setCancelling(null); }}>
            <form className="ui-dialog-panel max-w-lg space-y-4" onSubmit={event => {
                event.preventDefault();
                const alasan = String(new FormData(event.currentTarget).get('alasan') ?? '');
                void perform(async () => { await api.patch('/pengawas/ujian/' + panel.id + '/pelanggaran/' + cancelling.id, { alasan }); setCancelling(null); }, 'Pelanggaran dibatalkan.');
            }}>
                <h3 className="text-lg font-bold">Batalkan pelanggaran</h3>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <p className="text-sm text-slate-600">{cancelling.student} · {cancelling.label}. Kejadian tetap tercatat atas nama Anda, tetapi tidak dihitung lagi. Pembatalan tidak dapat diurungkan.</p>
                <label className="ui-label block">Alasan pembatalan
                    <textarea name="alasan" required minLength={5} maxLength={300} rows={3} className={fieldClass} placeholder="Contoh: telepon masuk, saya saksikan langsung." />
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" disabled={busy} className="ui-button ui-button-secondary" onClick={() => setCancelling(null)}>Batal</button>
                    <button type="submit" disabled={busy} className={primaryClass}>Batalkan Pelanggaran</button>
                </div>
            </form>
        </ModalOverlay>}
    </section>;
}

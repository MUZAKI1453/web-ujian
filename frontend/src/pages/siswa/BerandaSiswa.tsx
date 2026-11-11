import { fieldClass, primaryClass } from '../../components/ui/styles';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardList, Clock, GraduationCap, History, LockKeyhole, Search } from 'lucide-react';
import { PortalHeader } from '../../components/PortalHeader';
import PortalDialog from '../../components/PortalDialog';
import api, { mediaUrl } from '../../services/api';
import QuestionContent from '../guru/QuestionContent';
import KerjakanUjian from './KerjakanUjian';
import SubmissionReceipt, { type Receipt } from './SubmissionReceipt';
import { loadAttempt, storeAttempt } from './attemptStore';
import type { LocalAttempt, Question, Value } from './attemptStore';
import { errorMessage } from '../guru/QuestionEditor';
import { isStudentHistory, prioritizeStudentExams } from './studentSections';
import ExamTypeBadge from '../../components/ExamTypeBadge';
import Select from '../../components/ui/Select';
import { gradeDestinationLabels } from '../guru/examProfiles';

type Exam = {
    id: number; judul: string; mapel: string; mapelId: number; durasi: number; mulai: string; selesai: string;
    susulan: boolean; status: 'Berlangsung' | 'Terjadwal' | 'Selesai' | 'Draf'; masukBuka: boolean;
    perluToken: boolean;
    tujuanRekap: string;
    attempt: number | null; submitted: boolean; hasil: boolean; nilai: string | null; pembahasan: boolean; offline: boolean; menungguKoreksi: boolean;
};
type Packet = {
    attemptId: number; deadline: number; now: number; versi: number; jawaban: Record<string, Value>; soal: Question[]; securityCount: number;
    securityWeights?: LocalAttempt['securityWeights'];
};
type Result = { nilai: string; rincian: Record<string, { benar: number; total: number; poin: string; maksimum: string }> };
type Discussion = { soal: { id: number; pertanyaan: string; tipeSoal: string; semuaBenar: boolean;
    jawabanSiswa: Value | null; penilaian: { poin: string; maksimum: string; status: string } | null; catatan: string | null; isi: {
    gambar?: string; items?: { teks: string; gambar?: string; benar: boolean }[]; jawaban?: string[]; pedoman?: string;
} | null }[] };

const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const resultDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });
const resultScore = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
function progress(exam: Exam) {
    if (exam.offline) return 'Menunggu tinjauan';
    if (exam.hasil) return 'Hasil tersedia';
    if (exam.submitted) return exam.menungguKoreksi ? 'Menunggu koreksi' : 'Sudah dikumpulkan';
    if (exam.attempt && exam.status === 'Selesai') return 'Menunggu pengumpulan';
    if (exam.attempt && exam.status !== 'Selesai') return 'Sedang dikerjakan';
    if (exam.status === 'Selesai') return 'Tidak dikumpulkan';
    return 'Belum dikerjakan';
}

export default function BerandaSiswa({ username, adminMode, view = 'dashboard', navigationKey = 0, onNavigate }: {
    username: string; adminMode: boolean; view?: 'dashboard' | 'ujian' | 'hasil';
    navigationKey?: number; onNavigate: (page: string) => void;
}) {
    const [exams, setExams] = useState<Exam[]>([]);
    const [selected, setSelected] = useState<Exam | null>(null);
    const [working, setWorking] = useState<{ exam: Exam; attempt: LocalAttempt; securityPrepared?: boolean } | null>(null);
    const [output, setOutput] = useState<{ exam: Exam; result?: Result; discussion?: Discussion; receipt?: Receipt } | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [prepared, setPrepared] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [trendSubject, setTrendSubject] = useState('');
    const [destination, setDestination] = useState('');
    const latestNavigation = useRef(navigationKey);
    latestNavigation.current = navigationKey;

    useEffect(() => {
        setSelected(null);
        setPrepared(null);
        setOutput(null);
        setSearch('');
        setError('');
    }, [view, navigationKey]);

    const refresh = useCallback(async (signal?: AbortSignal) => {
        const { data } = await api.get<{ data: Exam[] }>('/siswa/ujian', { signal });
        if (signal?.aborted) return;
        setExams(data.data);
    }, []);

    const isWorking = working !== null;
    useEffect(() => {
        const controller = new AbortController();
        const update = async () => {
            try { await refresh(controller.signal); }
            catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
            finally { if (!controller.signal.aborted) setLoading(false); }
        };
        // Saat siswa mengerjakan ujian, layar pengerjaan punya sinkronisasi sendiri; daftar ini tidak perlu dimuat ulang.
        if (isWorking) return;
        void update();
        const poll = setInterval(() => { if (!document.hidden) void update(); }, 20000 + Math.random() * 10000);
        return () => { controller.abort(); clearInterval(poll); };
    }, [refresh, isWorking]);

    const key = (id: number) => username + ':' + id;

    async function enter(exam: Exam, token: FormDataEntryValue | null = null) {
        setBusy(true);
        setError('');
        let securityPrepared = false;
        try {
            // Request fullscreen directly from the submit gesture, before storage or network awaits.
            if (adminMode || exam.attempt || prepared) {
                if (document.documentElement.requestFullscreen && document.fullscreenEnabled !== false && !document.fullscreenElement) {
                    try { await document.documentElement.requestFullscreen(); }
                    catch { throw new Error('Layar penuh belum aktif. Izinkan fullscreen lalu coba lagi.'); }
                }
                if (document.hidden || !document.hasFocus()) throw new Error('Kembali ke halaman ujian sebelum memulai.');
                securityPrepared = true;
            }
            const local = await loadAttempt(key(exam.id)).catch(() => undefined);
            let packet: Packet;
            try {
                const url = '/siswa/ujian/' + exam.id;
                if (!adminMode && !exam.attempt && !prepared) {
                    const { data } = await api.post<{ izin: string }>(url + '/siapkan', { token }, { timeout: 12000 });
                    setPrepared(data.izin);
                    return;
                }
                const { data } = await api.post<Packet>(url + '/mulai', { izin: prepared }, { timeout: 12000 });
                packet = data;
            } catch (err) {
                if (local && local.attemptId === exam.attempt && !exam.submitted &&
                    (!navigator.onLine || (isAxiosError(err) && !err.response) || (local.versi > local.saved && Date.now() + local.offset >= local.deadline))) {
                    setWorking({ exam, attempt: local, securityPrepared });
                    setSelected(null);
                    return;
                }
                throw err;
            }
            const same = local?.attemptId === packet.attemptId ? local : undefined;
            const queued = same && same.versi > packet.versi;
            const attempt: LocalAttempt = {
                attemptId: packet.attemptId, deadline: packet.deadline, offset: packet.now - Date.now(),
                versi: queued ? same.versi : packet.versi, saved: packet.versi,
                lastSavedAt: same?.lastSavedAt, savedAnswers: packet.jawaban,
                jawaban: queued ? same.jawaban : packet.jawaban, soal: packet.soal, ragu: same?.ragu ?? [],
                index: Math.max(0, Math.min(same?.index ?? 0, packet.soal.length - 1)), send: same?.send ?? false,
                securityWeights: packet.securityWeights,
                security: { count: Math.max(same?.security?.count ?? 0, packet.securityCount ?? 0), pending: same?.security?.pending ?? [], warning: same?.security?.warning }
            };
            await storeAttempt(key(exam.id), attempt).catch(() => {});
            for (const source of packet.soal.flatMap(q => [q.gambar, ...q.items.map(i => i.gambar)])) {
                if (source && !source.startsWith('data:')) { const image = new Image(); image.src = mediaUrl(source); }
            }
            setWorking({ exam, attempt, securityPrepared });
            setSelected(null);
        } catch (err) {
            if (isAxiosError(err) && err.response?.status === 409 && !exam.attempt) setPrepared(null);
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            setError(err instanceof Error && !isAxiosError(err) ? err.message : errorMessage(err));
        }
        finally { setBusy(false); }
    }

    async function show(exam: Exam, kind: 'hasil' | 'pembahasan' | 'bukti') {
        const requestedNavigation = latestNavigation.current;
        setError('');
        setBusy(true);
        try {
            if (kind === 'bukti') {
                const { data } = await api.get<Receipt>('/siswa/ujian/' + exam.id + '/bukti');
                if (requestedNavigation === latestNavigation.current) setOutput({ exam, receipt: data });
            } else if (kind === 'hasil') {
                const { data } = await api.get<Result>('/siswa/ujian/' + exam.id + '/hasil');
                if (requestedNavigation === latestNavigation.current) setOutput({ exam, result: data });
            } else {
                const { data } = await api.get<Discussion>('/siswa/ujian/' + exam.id + '/pembahasan');
                if (requestedNavigation === latestNavigation.current) setOutput({ exam, discussion: data });
            }
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    const pending = prioritizeStudentExams(exams.filter(exam => !isStudentHistory(exam)));
    const results = exams.filter(exam => exam.submitted || exam.offline)
        .sort((a, b) => +new Date(b.mulai) - +new Date(a.mulai));
    const keyword = search.trim().toLocaleLowerCase('id-ID');
    const filtered = pending.filter(exam =>
        (exam.judul + ' ' + exam.mapel).toLocaleLowerCase('id-ID').includes(keyword));
    const displayed = view === 'dashboard' ? pending.slice(0, 2) : filtered;

    function renderExam(exam: Exam) {
        const status = exam.status;
        return <article key={exam.id} className="ui-card flex h-full min-w-0 flex-col p-5" data-status={status}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <ExamTypeBadge label={exam.judul} />
                        <span className={'cbt-badge ' + (status === 'Berlangsung' ? 'bg-emerald-100 text-emerald-800' : status === 'Terjadwal' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>{status === 'Terjadwal' ? 'Terjadwal' : progress(exam)}</span>
                    </div>
                    <h3 className="mb-3 mt-3 break-words text-lg font-semibold">{exam.mapel}</h3>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600"><CalendarDays size={16} />{schedule.format(new Date(exam.mulai))}</p>
                    <p className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Clock size={16} />{exam.durasi} menit{exam.susulan ? ' · Susulan' : ''}</p>
                    <p className="mb-6 text-xs text-slate-500">Batas akhir: {schedule.format(new Date(exam.selesai))}</p>
                    <div className="mt-auto flex flex-wrap gap-2">
                        {(!exam.submitted && !exam.offline && (exam.attempt || (status === 'Berlangsung' && exam.masukBuka))) &&
                            <button type="button" disabled={busy} className={primaryClass + ' flex w-full items-center justify-center gap-2 py-3'} onClick={() => {
                                setOutput(null);
                                setError('');
                                if (adminMode) void enter(exam);
                                else { setSelected(exam); setPrepared(null); }
                            }}>
                                {exam.attempt ? status === 'Selesai' ? 'Sinkronkan Jawaban' : 'Lanjutkan Ujian' : 'Kerjakan Ujian'} <ArrowRight size={17} />
                            </button>}
                        {status === 'Berlangsung' && !exam.masukBuka && !exam.attempt && <span className="text-sm text-slate-600">Akses masuk ditutup</span>}
                        {!exam.attempt && !exam.submitted && (status === 'Terjadwal' || status === 'Selesai' || status === 'Draf') && <button type="button" disabled className="ui-button ui-button-secondary flex items-center justify-center gap-2"><LockKeyhole size={17} />{status === 'Selesai' ? 'Waktu Habis' : 'Belum Dibuka'}</button>}
                    </div>
                </article>;
    }

    if (working) return <KerjakanUjian initial={working.attempt} storageKey={key(working.exam.id)} examId={working.exam.id}
        title={working.exam.mapel} examType={working.exam.judul} securityPrepared={working.securityPrepared} onExit={() => { setWorking(null); void refresh().catch(err => setError(errorMessage(err))); }} />;

    if (output) return <section className="ui-card space-y-4 bg-white p-5">
        <button type="button" className="ui-button ui-button-secondary" onClick={() => setOutput(null)}><ArrowLeft size={16} />Kembali ke Hasil Ujian</button>
        <h1 className="ui-page-title break-words">{output.exam.mapel}</h1>
        <ExamTypeBadge label={output.exam.judul} />
        {output.receipt && <SubmissionReceipt receipt={output.receipt} />}
        {output.result && <>
            <p className="rounded-xl bg-blue-50 p-4 text-blue-900">Nilai akhir <strong className="ml-2 text-3xl">{output.result.nilai}</strong></p>
            <table className="ui-table w-full text-left text-sm">
                <thead className="bg-slate-50"><tr>{['Tipe', 'Benar / total', 'Poin / maksimum'].map(label => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
                <tbody>{Object.entries(output.result.rincian).map(([type, stat]) => <tr key={type} className="border-t">
                    <td className="p-2">{type}</td><td className="p-2">{stat.benar} / {stat.total}</td><td className="p-2">{stat.poin} / {stat.maksimum}</td>
                </tr>)}</tbody>
            </table>
        </>}
        {output.discussion?.soal.map((q, index) => <article className="space-y-2 rounded-lg border p-4" key={q.id}>
            <h2 className="font-semibold">Soal {index + 1} · {q.tipeSoal}</h2>
            <QuestionContent text={q.pertanyaan} image={q.isi?.gambar} />
            <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <p className="font-semibold">Jawabanmu</p>
                <p className="whitespace-pre-wrap break-words">{q.jawabanSiswa === null ? 'Belum dijawab' : typeof q.jawabanSiswa === 'string' ? q.jawabanSiswa.trim() || 'Belum dijawab' : Array.isArray(q.jawabanSiswa) ? q.jawabanSiswa.length ? q.jawabanSiswa.map((value, i) => q.tipeSoal === 'BS' ? `${i + 1}. ${value === null ? 'Kosong' : value ? 'Benar' : 'Salah'}` : String.fromCharCode(65 + Number(value))).join(', ') : 'Belum dijawab' : String.fromCharCode(65 + q.jawabanSiswa)}</p>
            </div>
            <p className="text-sm font-semibold">{q.penilaian ? `${q.penilaian.status} · ${Number(q.penilaian.poin)} / ${Number(q.penilaian.maksimum)} poin` : 'Nilai belum dirilis atau menunggu koreksi.'}</p>
            {q.catatan && <p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm">Catatan guru · {q.catatan}</p>}
            {q.semuaBenar && <p className="text-sm text-green-800">Semua jawaban diterima.</p>}
            {q.isi?.items?.map((item, i) => <div className="rounded bg-slate-50 p-2 text-sm" key={i}>
                <span className="font-semibold">{q.tipeSoal === 'BS' ? `${i + 1}. ` : `${String.fromCharCode(65 + i)}. `}</span><QuestionContent text={item.teks} image={item.gambar} /> {q.tipeSoal === 'BS' ? item.benar ? '· Benar' : '· Salah' : item.benar ? '· Kunci' : ''}
            </div>)}
            {q.isi?.jawaban && <p className="text-sm">Jawaban diterima · {q.isi.jawaban.join(' / ')}</p>}
            {q.isi?.pedoman && <p className="text-sm">Pedoman · {q.isi.pedoman}</p>}
        </article>)}
    </section>;

    if (view === 'hasil') {
        const visibleResults = results.filter(exam => !destination || exam.tujuanRekap === destination);
        const released = visibleResults.filter(exam => exam.hasil && exam.nilai !== null && (destination || exam.tujuanRekap === 'buku-nilai'));
        const subjects = new Map(released.map(exam => [String(exam.mapelId), exam.mapel]));
        const subject = subjects.has(trendSubject) ? trendSubject : subjects.keys().next().value;
        const trend = released.filter(exam => String(exam.mapelId) === subject).slice(0, 10).reverse();
        return <section className="cbt-portal cbt-student">
            <header className="ui-card space-y-2 p-5 sm:p-8">
                <h1 className="ui-page-title flex items-center gap-2.5"><History size={28} className="text-blue-600" aria-hidden="true" />Hasil Ujian</h1>
                <p className="text-sm text-slate-600">Ringkasan nilai dan pembahasan ujian yang sudah kamu kumpulkan.</p>
            </header>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {loading && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat hasil ujian…</p>}
            {!loading && !error && !results.length && <p className="ui-card p-5 text-sm text-slate-600">Belum ada ujian yang dikumpulkan.</p>}
            {results.length > 0 && <div className="ui-card p-4">
                <label htmlFor="student-result-destination" className="ui-label mr-3">Tujuan rekap</label>
                <Select id="student-result-destination" value={destination} onValueChange={setDestination}>
                    <option value="">Semua hasil</option>
                    {Object.entries(gradeDestinationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
            </div>}
            {results.length > 0 && !visibleResults.length && <p className="ui-card p-5 text-sm text-slate-600">Belum ada hasil untuk rekap ini.</p>}
            {!adminMode && released.length > 0 && <section className="ui-card space-y-3 p-5" aria-labelledby="student-score-trend">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="student-score-trend" className="font-semibold">Tren nilai per mata pelajaran</h2>
                        <p className="mt-1 text-sm text-slate-600">{gradeDestinationLabels[destination || 'buku-nilai']} · Maksimal 10 nilai yang sudah dirilis, dari ujian terlama ke terbaru.</p>
                    </div>
                    <Select aria-label="Mata pelajaran untuk tren nilai" value={subject} onValueChange={setTrendSubject}>
                        {[...subjects].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </Select>
                </div>
                <ol className="space-y-3">
                    {trend.map(exam => <li key={exam.id} className="space-y-1 text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                            <span>{exam.judul} · <time dateTime={exam.mulai}>{resultDate.format(new Date(exam.mulai))}</time></span>
                            <strong className="tabular-nums">{resultScore.format(Number(exam.nilai))}</strong>
                        </div>
                        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-600" style={{ width: Math.max(0, Math.min(100, Number(exam.nilai))) + '%' }} />
                        </div>
                    </li>)}
                </ol>
            </section>}
            {visibleResults.length > 0 && <div className="ui-card overflow-x-auto">
                <table className="ui-table">
                    <caption className="sr-only">Ringkasan hasil ujian</caption>
                    <thead><tr><th scope="col" className="px-2 sm:px-4">Ujian</th><th scope="col" className="px-2 sm:px-4">Nilai</th><th scope="col" className="px-2 sm:px-4">Pembahasan</th></tr></thead>
                    <tbody>{visibleResults.map(exam => <tr key={exam.id}>
                        <th scope="row" className="border-b border-slate-100 px-2 py-3 text-left font-normal sm:px-4">
                            <span className="block break-words font-semibold text-slate-900">{exam.mapel}</span>
                            <span className="mt-1 block break-words text-xs text-slate-600">{exam.judul}{exam.susulan ? ' · Susulan' : ''}</span>
                            <span className="mt-1 block text-xs text-slate-500">{gradeDestinationLabels[exam.tujuanRekap]}</span>
                            <time dateTime={exam.mulai} className="mt-1 block text-xs text-slate-500">{resultDate.format(new Date(exam.mulai))}</time>
                            <button type="button" disabled={busy} className="min-h-11 text-left text-xs font-semibold text-blue-700 hover:underline"
                                onClick={() => void show(exam, 'bukti')}>Bukti Pengumpulan</button>
                        </th>
                        <td className="px-2 sm:px-4">
                            {exam.hasil && exam.nilai != null ? <button type="button" disabled={busy} onClick={() => void show(exam, 'hasil')}
                                aria-label={'Lihat rincian nilai ' + exam.mapel} className="min-h-11 font-semibold tabular-nums text-blue-700 hover:underline">{resultScore.format(Number(exam.nilai))}</button>
                                : <span className="text-xs text-slate-600">{exam.offline || exam.menungguKoreksi ? progress(exam) : 'Belum dirilis'}</span>}
                        </td>
                        <td className="px-2 sm:px-4">
                            {exam.pembahasan ? <button type="button" disabled={busy} className="ui-button ui-button-soft px-2 text-xs sm:px-4 sm:text-sm"
                                onClick={() => void show(exam, 'pembahasan')}>Pembahasan</button> : <span className="text-xs text-slate-500">Belum dirilis</span>}
                        </td>
                    </tr>)}</tbody>
                </table>
            </div>}
        </section>;
    }

    return <section className="cbt-portal cbt-student">
        {view === 'dashboard' ? <>
            <PortalHeader title="Agenda Ujian" label="Jadwal & pencapaian" subtitle="Temukan ujian yang perlu dikerjakan dan ikuti hasil belajarmu." icon={GraduationCap}>
                <button type="button" className={primaryClass} onClick={() => onNavigate('siswa-ujian')}><ClipboardList size={17} aria-hidden="true" />Ujian Saya<ArrowRight size={16} aria-hidden="true" /></button>
            </PortalHeader>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {[
                    { label: 'Berlangsung', value: pending.filter(exam => exam.status === 'Berlangsung').length },
                    { label: 'Terjadwal', value: pending.filter(exam => exam.status === 'Terjadwal').length },
                    { label: 'Terkumpul', value: results.filter(exam => exam.submitted && !exam.offline).length }
                ].map(stat => <div key={stat.label} className="ui-card p-3 sm:p-5">
                    <p className="text-2xl font-bold tabular-nums">{loading ? '—' : stat.value}</p>
                    <p className="mt-1 break-words text-xs text-slate-500 sm:text-sm">{stat.label}</p>
                </div>)}
            </div>
        </> : <header className="ui-card flex flex-wrap items-center justify-between gap-3 p-5 sm:p-8">
            <h1 className="ui-page-title flex items-center gap-2.5"><ClipboardList size={28} className="text-blue-600" aria-hidden="true" />Ujian Saya</h1>
        </header>}
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {selected && <PortalDialog titleId="exam-instructions" onClose={() => { if (!busy) { setSelected(null); setPrepared(null); } }}><form onSubmit={event => { event.preventDefault(); void enter(selected, new FormData(event.currentTarget).get('token')); }} className="space-y-5">
            <span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><ClipboardList size={28} /></span>
            <div><p className="text-sm font-semibold text-blue-600">Sebelum memulai</p><h2 id="exam-instructions" className="mt-1 break-words text-xl font-bold">{selected.mapel}</h2>
                <div className="mt-2"><ExamTypeBadge label={selected.judul} /></div>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600"><p className="font-semibold text-slate-800">Durasi ujian: {selected.durasi} menit</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Kerjakan satu soal per layar dan gunakan navigasi untuk berpindah soal.</li><li>Tandai soal yang ragu dan periksa kembali sebelum mengumpulkan.</li><li>Jawaban disimpan otomatis. Tetap di halaman ujian sampai jawaban terkirim.</li></ul></div>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {!selected.attempt && !prepared && selected.perluToken && <label className="ui-label block max-w-xs">Token ujian
                <input name="token" autoComplete="off" maxLength={6} minLength={6} required className={fieldClass + ' uppercase'} />
            </label>}
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Ujian memakai mode pengamanan. Keluar fullscreen, berpindah tab/aplikasi, atau split screen akan dicatat. Setelah 3 pelanggaran, ujian dikumpulkan otomatis.</p>
            {prepared && <p role="status" className="text-sm text-green-800">{selected.perluToken ? 'Token terverifikasi.' : 'Ujian siap.'} Mulai Ujian akan menyiapkan layar penuh terlebih dahulu, lalu memulai soal dan timer.</p>}
            {(!document.documentElement.requestFullscreen || document.fullscreenEnabled === false) && <p className="text-sm text-amber-900">Browser ini tidak mendukung fullscreen. Pemantauan tab dan fokus tetap aktif.</p>}
            <div className="flex gap-2">
                <button type="button" disabled={busy} className="ui-button ui-button-secondary border" onClick={() => { setSelected(null); setPrepared(null); }}>Batal</button>
                <button type="submit" disabled={busy} className={primaryClass}>
                    {busy ? 'Menyiapkan soal…' : selected.attempt ? 'Lanjutkan Ujian' : prepared ? 'Mulai Ujian' : selected.perluToken ? 'Verifikasi Token' : 'Siapkan Ujian'}
                </button>
            </div>
        </form></PortalDialog>}
        {loading && <p role="status">Memuat daftar ujian…</p>}
        <section className="space-y-3" aria-label="Daftar ujian">
            <header className="flex flex-wrap items-center justify-between gap-3">
                {view === 'dashboard' ? <>
                    <h2 className="text-lg font-bold">Ujian untukmu</h2>
                    <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('siswa-ujian')}>Lihat semua<ArrowRight size={16} aria-hidden="true" /></button>
                </> : <>
                    <span className="text-sm text-slate-500">{loading ? '—' : filtered.length + ' ujian'}</span>
                    <div className="relative w-full sm:w-80">
                        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input type="search" aria-label="Cari ujian atau mata pelajaran" className="ui-input w-full pl-10" placeholder="Cari ujian atau mapel…"
                            value={search} onChange={event => setSearch(event.target.value)} />
                    </div>
                </>}
            </header>
            <div className="grid gap-4 md:grid-cols-2">{displayed.map(exam => renderExam(exam))}</div>
            {!loading && !displayed.length && <div className="ui-card space-y-3 px-5 py-10 text-center">
                <ClipboardList size={36} className="mx-auto text-slate-300" aria-hidden="true" />
                <p className="text-sm text-slate-500">{search.trim() ? 'Ujian tidak ditemukan.' : 'Belum ada ujian yang perlu dikerjakan.'}</p>
                {search.trim() ? <button type="button" className="ui-button ui-button-secondary" onClick={() => setSearch('')}>Hapus pencarian</button>
                    : view === 'dashboard' && results.length > 0 && <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('siswa-hasil')}>Lihat hasil ujian<ArrowRight size={16} aria-hidden="true" /></button>}
            </div>}
        </section>
    </section>;
}

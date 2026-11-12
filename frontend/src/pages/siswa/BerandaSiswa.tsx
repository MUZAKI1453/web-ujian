import { fieldClass, primaryClass } from '../../components/ui/styles';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardList, Clock, GraduationCap, History, KeyRound, LockKeyhole, Search } from 'lucide-react';
import { ExamListHeader, PortalHeader } from '../../components/PortalHeader';
import PortalDialog from '../../components/PortalDialog';
import api, { mediaUrl } from '../../services/api';
import ExamQuestionReview, { ExamReviewHeader, optionLabel } from '../../components/ExamQuestionReview';
import { questionTypeLabel } from '../guru/questionTypes';
import KerjakanUjian from './KerjakanUjian';
import { interruptsExam } from './useExamSecurity';
import SubmissionReceipt, { type Receipt } from './SubmissionReceipt';
import { loadAttempt, storeAttempt } from './attemptStore';
import type { LocalAttempt, Question, Value } from './attemptStore';
import { errorMessage } from '../guru/QuestionEditor';
import { isStudentHistory, prioritizeStudentExams } from './studentSections';
import ExamTypeBadge from '../../components/ExamTypeBadge';
import Select from '../../components/ui/Select';
import { backLayer, useBackHandler } from '../../components/ui/useBackHandler';
import { fullscreenAvailable, nativeApp } from '../../services/nativeApp';
import type { MatchingContent } from '../guru/matchingPairs';

type Exam = {
    id: number; judul: string; mapel: string; mapelId: number; durasi: number; mulai: string; selesai: string;
    susulan: boolean; status: 'Berlangsung' | 'Terjadwal' | 'Selesai' | 'Draf'; masukBuka: boolean;
    perluToken: boolean;
    attempt: number | null; submitted: boolean; hasil: boolean; nilai: string | null; pembahasan: boolean; offline: boolean; menungguKoreksi: boolean;
};
type Packet = {
    attemptId: number; deadline: number; now: number; versi: number; jawaban: Record<string, Value>; soal: Question[]; securityCount: number;
    securityWeights?: LocalAttempt['securityWeights']; securityLimit?: number;
};
type AttemptLocation = Pick<Exam, 'id' | 'mapel' | 'judul'> & { attemptId: number };
type Result = { nilai: string; rincian: Record<string, { benar: number; total: number; poin: string; maksimum: string }> };
type Discussion = { soal: { id: number; nomor: number; pertanyaan: string; tipeSoal: string; semuaBenar: boolean;
    jawabanSiswa: Value | null; penilaian: { poin: string; maksimum: string; status: string } | null; catatan: string | null; isi: ({
    gambar?: string; items?: { teks: string; gambar?: string; benar: boolean }[]; jawaban?: string[];
} & MatchingContent) | null }[] };

const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
const resultDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });
const resultScore = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const questionScore = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });

function discussionAnswer(value: Value | null, type: string) {
    if (value === null) return 'Belum dijawab';
    if (typeof value === 'string') return value.trim() || 'Belum dijawab';
    if (typeof value === 'number') return optionLabel(value);
    if (!value.length) return 'Belum dijawab';
    if (type === 'BS') {
        return value.map((answer, index) => `${index + 1}. ${answer === null ? 'Kosong' : answer ? 'Benar' : 'Salah'}`).join(' · ');
    }
    return value.map(index => optionLabel(Number(index))).join(', ');
}

function StudentAnswerReview({ question }: { question: Discussion['soal'][number] }) {
    return <div className="space-y-2 text-sm">
        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold text-slate-900">Jawabanmu</p>
                {question.penilaian && <p className={'text-xs font-semibold ' + (question.penilaian.status === 'Salah' ? 'text-red-800' : 'text-slate-700')}>
                    {question.penilaian.status}
                </p>}
            </div>
            {question.tipeSoal !== 'JODOH' && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{discussionAnswer(question.jawabanSiswa, question.tipeSoal)}</p>}
            {!question.penilaian && <p className="text-xs text-slate-600">Nilai belum dirilis atau menunggu koreksi.</p>}
        </div>
        {question.catatan && <div className="space-y-1 rounded-xl bg-amber-50 p-3">
            <p className="font-semibold text-amber-950">Catatan guru</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{question.catatan}</p>
        </div>}
    </div>;
}

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
    const [working, setWorking] = useState<{ exam: AttemptLocation; attempt: LocalAttempt; securityPrepared?: boolean } | null>(null);
    const [output, setOutput] = useState<{ exam: Exam; result?: Result; discussion?: Discussion; receipt?: Receipt } | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [prepared, setPrepared] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [trendSubject, setTrendSubject] = useState('');
    const latestNavigation = useRef(navigationKey);
    latestNavigation.current = navigationKey;
    const resumeKey = 'cbt-active-attempt:' + username;

    useBackHandler(!!output && !working, () => setOutput(null), backLayer.detail);

    useEffect(() => {
        let active = true;
        async function restore() {
            const location = JSON.parse(sessionStorage.getItem(resumeKey) ?? 'null') as AttemptLocation | null;
            if (!location) return;
            const attempt = await loadAttempt(username + ':' + location.id);
            if (active && attempt?.attemptId === location.attemptId) {
                setWorking(current => current ?? { exam: location, attempt });
            }
        }
        void restore().catch(() => {});
        return () => { active = false; };
    }, [resumeKey, username]);

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

    function openAttempt(exam: Exam, attempt: LocalAttempt, securityPrepared: boolean) {
        const location = { id: exam.id, mapel: exam.mapel, judul: exam.judul, attemptId: attempt.attemptId };
        try { sessionStorage.setItem(resumeKey, JSON.stringify(location)); }
        catch { /* Pengerjaan tetap bisa berjalan jika penyimpanan sesi tidak tersedia. */ }
        setWorking({ exam: location, attempt, securityPrepared });
        setSelected(null);
    }

    async function enter(exam: Exam, token: FormDataEntryValue | null = null) {
        setBusy(true);
        setError('');
        let securityPrepared = false;
        try {
            // Request fullscreen directly from the submit gesture, before storage or network awaits.
            if (adminMode || exam.attempt || prepared) {
                if (fullscreenAvailable() && !document.fullscreenElement) {
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
                    openAttempt(exam, local, securityPrepared);
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
                securityWeights: packet.securityWeights, securityLimit: packet.securityLimit,
                security: { count: (packet.securityCount ?? 0) + (same?.security?.pending ?? []).filter(event => interruptsExam(event.reason)).length, pending: same?.security?.pending ?? [], warning: same?.security?.warning }
            };
            await storeAttempt(key(exam.id), attempt).catch(() => {});
            for (const source of packet.soal.flatMap(q => [q.gambar, ...q.items.map(i => i.gambar)])) {
                if (source && !source.startsWith('data:')) { const image = new Image(); image.src = mediaUrl(source); }
            }
            openAttempt(exam, attempt, securityPrepared);
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
        const { status } = exam;
        const canEnter = !exam.submitted && !exam.offline && (exam.attempt !== null || (status === 'Berlangsung' && exam.masukBuka));
        const available = status === 'Berlangsung' && canEnter;
        const label = available && !exam.attempt ? 'Bisa dikerjakan'
            : status === 'Terjadwal' || status === 'Draf' ? status : progress(exam);
        const badgeStyle = available ? 'bg-emerald-100 text-emerald-800'
            : status === 'Terjadwal' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700';

        return <article key={exam.id} className="cbt-exam-card gap-3 sm:gap-4" data-status={status}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">{exam.mapel}</h3>
                <span className={'ui-badge ' + badgeStyle}>{label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <ExamTypeBadge label={exam.judul} />
                {exam.susulan && <span className="ui-badge bg-slate-100 text-slate-700">Susulan</span>}
            </div>
            <dl className="grid gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-3 text-sm min-[440px]:grid-cols-2">
                <div className="flex min-w-0 items-start gap-2">
                    <CalendarDays size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                    <div>
                        <dt className="text-xs text-slate-500">Mulai</dt>
                        <dd className="font-medium text-slate-800"><time dateTime={exam.mulai}>{schedule.format(new Date(exam.mulai))} WIB</time></dd>
                    </div>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                    <Clock size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                    <div>
                        <dt className="text-xs text-slate-500">Batas akhir</dt>
                        <dd className="font-medium text-slate-800"><time dateTime={exam.selesai}>{schedule.format(new Date(exam.selesai))} WIB</time></dd>
                    </div>
                </div>
            </dl>
            <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><Clock size={14} aria-hidden="true" />Durasi {exam.durasi} menit</span>
                    {exam.perluToken && !exam.attempt && <span className="inline-flex items-center gap-1.5"><KeyRound size={14} aria-hidden="true" />Perlu token</span>}
                </div>
                {canEnter ? <button type="button" disabled={busy} className={primaryClass + ' w-full justify-between'} onClick={() => {
                    setOutput(null);
                    setError('');
                    if (adminMode) void enter(exam);
                    else { setSelected(exam); setPrepared(null); }
                }}>
                    {exam.attempt ? status === 'Selesai' ? 'Sinkronkan Jawaban' : 'Lanjutkan Ujian' : 'Kerjakan Ujian'}<ArrowRight size={17} aria-hidden="true" />
                </button> : <p className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    <LockKeyhole size={16} aria-hidden="true" />
                    {status === 'Selesai' ? 'Waktu habis' : status === 'Berlangsung' ? 'Akses masuk ditutup' : 'Belum dibuka'}
                </p>}
            </div>
        </article>;
    }

    if (working) return <KerjakanUjian initial={working.attempt} storageKey={key(working.exam.id)} examId={working.exam.id}
        title={working.exam.mapel} examType={working.exam.judul} securityPrepared={working.securityPrepared} onExit={() => {
            try { sessionStorage.removeItem(resumeKey); } catch { /* Penyimpanan sesi tidak tersedia. */ }
            setWorking(null);
            void refresh().catch(err => setError(errorMessage(err)));
        }} />;

    if (output) return <section className="cbt-portal cbt-student">
        <ExamReviewHeader label={output.discussion ? 'Pembahasan Soal' : output.receipt ? 'Bukti Pengumpulan' : 'Rincian Nilai'}
            title={output.exam.mapel} metadata={<ExamTypeBadge label={output.exam.judul} />}
            actions={<button type="button" className="ui-button ui-button-soft" onClick={() => setOutput(null)}>
                <ArrowLeft size={16} aria-hidden="true" />Kembali ke Hasil Ujian
            </button>} />
        {output.receipt && <SubmissionReceipt receipt={output.receipt} />}
        {output.result && <div className="ui-card min-w-0 space-y-4 p-4 sm:p-5">
            <p className="rounded-xl bg-blue-50 p-4 text-blue-900">Nilai akhir <strong className="ml-2 text-3xl">{output.result.nilai}</strong></p>
            <div className="overflow-x-auto"><table className="ui-table w-full text-left text-sm">
                <thead className="bg-slate-50"><tr>{['Tipe', 'Benar / total', 'Poin / maksimum'].map(label => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
                <tbody>{Object.entries(output.result.rincian).map(([type, stat]) => <tr key={type} className="border-t">
                    <td className="p-2">{questionTypeLabel(type)}</td><td className="p-2">{stat.benar} / {stat.total}</td><td className="p-2">{stat.poin} / {stat.maksimum}</td>
                </tr>)}</tbody>
            </table></div>
        </div>}
        {output.discussion && (output.discussion.soal.length
            ? <ExamQuestionReview questions={output.discussion.soal}
                points={question => question.penilaian
                    ? `${questionScore.format(Number(question.penilaian.poin))} / ${questionScore.format(Number(question.penilaian.maksimum))} poin`
                    : undefined}
                details={question => <StudentAnswerReview question={question} />} />
            : <p className="ui-card p-4 text-sm text-slate-600">Belum ada soal untuk dibahas.</p>)}
    </section>;

    if (view === 'hasil') {
        const released = results.filter(exam => exam.hasil && exam.nilai !== null);
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
            {!adminMode && released.length > 0 && <section className="ui-card space-y-3 p-5" aria-labelledby="student-score-trend">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="student-score-trend" className="font-semibold">Tren nilai per mata pelajaran</h2>
                        <p className="mt-1 text-sm text-slate-600">Maksimal 10 nilai yang sudah dirilis, dari ujian terlama ke terbaru.</p>
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
            {results.length > 0 && <div className="ui-card overflow-x-auto">
                <table className="ui-table">
                    <caption className="sr-only">Ringkasan hasil ujian</caption>
                    <thead><tr><th scope="col" className="px-2 sm:px-4">Ujian</th><th scope="col" className="px-2 sm:px-4">Nilai</th><th scope="col" className="px-2 sm:px-4">Pembahasan</th></tr></thead>
                    <tbody>{results.map(exam => <tr key={exam.id}>
                        <th scope="row" className="border-b border-slate-100 px-2 py-3 text-left font-normal sm:px-4">
                            <span className="block break-words font-semibold text-slate-900">{exam.mapel}</span>
                            <span className="mt-1 block break-words text-xs text-slate-600">{exam.judul}{exam.susulan ? ' · Susulan' : ''}</span>
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
        </> : <ExamListHeader description="Cek jadwal, durasi, dan batas akhir ujianmu. Buka ujian dari daftar saat akses tersedia.">
            <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('siswa-hasil')}>
                <History size={17} aria-hidden="true" />Hasil Ujian
            </button>
        </ExamListHeader>}
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
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Ujian memakai mode pengamanan. Keluar fullscreen, berpindah tab/aplikasi, atau split screen dapat dicatat. Pengumpulan otomatis mengikuti batas yang diatur guru.</p>
            {prepared && <p role="status" className="text-sm text-green-800">{selected.perluToken ? 'Token terverifikasi.' : 'Ujian siap.'} Mulai Ujian akan menyiapkan layar penuh terlebih dahulu, lalu memulai soal dan timer.</p>}
            {!fullscreenAvailable() && !nativeApp() && <p className="text-sm text-amber-900">Browser ini tidak mendukung fullscreen. Pemantauan tab dan fokus tetap aktif.</p>}
            <div className="flex gap-2">
                <button type="button" disabled={busy} className="ui-button ui-button-secondary border" onClick={() => { setSelected(null); setPrepared(null); }}>Batal</button>
                <button type="submit" disabled={busy} className={primaryClass}>
                    {busy ? 'Menyiapkan soal…' : selected.attempt ? 'Lanjutkan Ujian' : prepared ? 'Mulai Ujian' : selected.perluToken ? 'Verifikasi Token' : 'Siapkan Ujian'}
                </button>
            </div>
        </form></PortalDialog>}
        {loading && <p role="status">Memuat daftar ujian…</p>}
        <section className="space-y-3" aria-label="Daftar ujian">
            <header className={'flex flex-wrap items-center justify-between gap-3 ' + (view === 'ujian' ? 'ui-card p-4' : '')}>
                {view === 'dashboard' ? <>
                    <h2 className="text-lg font-bold">Ujian untukmu</h2>
                    <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('siswa-ujian')}>Lihat semua<ArrowRight size={16} aria-hidden="true" /></button>
                </> : <>
                    <div>
                        <h2 className="font-semibold text-slate-900">Daftar ujian</h2>
                        {!loading && <p className="mt-0.5 text-xs text-slate-500">{filtered.length} ujian{keyword ? ' ditemukan' : ''}</p>}
                    </div>
                    <div className="relative w-full sm:w-80">
                        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input type="search" aria-label="Cari ujian atau mata pelajaran" className="ui-input w-full pl-10" placeholder="Cari ujian atau mapel…"
                            value={search} onChange={event => setSearch(event.target.value)} />
                    </div>
                </>}
            </header>
            <div className="grid gap-4 md:grid-cols-2">{displayed.map(exam => renderExam(exam))}</div>
            {!loading && !error && !displayed.length && <div className="ui-card space-y-3 px-5 py-10 text-center">
                <ClipboardList size={36} className="mx-auto text-slate-300" aria-hidden="true" />
                <p className="text-sm text-slate-500">{search.trim() ? 'Ujian tidak ditemukan.' : 'Belum ada ujian yang perlu dikerjakan.'}</p>
                {search.trim() ? <button type="button" className="ui-button ui-button-secondary" onClick={() => setSearch('')}>Hapus pencarian</button>
                    : view === 'dashboard' && results.length > 0 && <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('siswa-hasil')}>Lihat hasil ujian<ArrowRight size={16} aria-hidden="true" /></button>}
            </div>}
        </section>
    </section>;
}

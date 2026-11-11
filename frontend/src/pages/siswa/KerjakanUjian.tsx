import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../../services/api';
import QuestionContent from '../guru/QuestionContent';
import { storeAttempt } from './attemptStore';
import type { LocalAttempt, Value } from './attemptStore';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, ListOrdered, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import useExamSecurity, { interruptsExam } from './useExamSecurity';
import PortalDialog from '../../components/PortalDialog';
import ActionDialog from '../../components/ActionDialog';
import { answerState } from './answerStatus';
import SubmissionReceipt, { type Receipt } from './SubmissionReceipt';
import ExamTypeBadge from '../../components/ExamTypeBadge';

const button = 'ui-button ui-button-secondary';

export default function KerjakanUjian({ initial, storageKey, examId, title, examType, onExit, securityPrepared = false }: {
    initial: LocalAttempt; storageKey: string; examId: number; title: string; examType: string; onExit: () => void; securityPrepared?: boolean;
}) {
    const [attempt, setAttempt] = useState(initial);
    const [time, setTime] = useState(Date.now());
    const [sheet, setSheet] = useState(false);
    const [result, setResult] = useState('');
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [saveState, setSaveState] = useState('');
    const [offline, setOffline] = useState(!navigator.onLine);
    const [storageFailed, setStorageFailed] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const [confirmFinish, setConfirmFinish] = useState(false);
    const current = useRef(initial);
    const sending = useRef(false);
    const stopped = useRef(false);
    const main = useRef<HTMLElement>(null);
    const remain = Math.max(0, Math.ceil((attempt.deadline - time - attempt.offset) / 1000));
    const locked = !remain || attempt.send;

    function update(value: LocalAttempt) {
        current.current = value;
        setAttempt(value);
        void storeAttempt(storageKey, value).catch(() => setStorageFailed(true));
    }
    const security = useExamSecurity(current, update, !!result, securityPrepared);
    const queuedAnswers = Object.keys({ ...attempt.jawaban, ...attempt.savedAnswers }).filter(id =>
        JSON.stringify(attempt.jawaban[id]) !== JSON.stringify(attempt.savedAnswers?.[id])).length;

    useEffect(() => {
        if (!security.ready) { setSheet(false); setConfirmFinish(false); setAcknowledged(false); }
    }, [security.ready]);

    useEffect(() => {
        let active = true;
        let lastContact = 0;
        // Tanpa perubahan, cukup menyapa server tiap 25–35 detik. Jeda acak mencegah semua perangkat mengirim serentak.
        const heartbeat = 25000 + Math.random() * 10000;
        async function sync(force = false) {
            if (!active || stopped.current || sending.current) return;
            const data = current.current;
            const urgent = data.send || !!data.security?.pending.length;
            const dirty = data.versi > data.saved || urgent;
            if (!navigator.onLine) { setOffline(true); return; }
            // Jawaban sudah aman di perangkat; kirim perubahan paling cepat tiap 5 detik.
            // Heartbeat also detects logout on a different device or an ended session.
            const idle = Date.now() - lastContact;
            if (!force && !urgent && idle < (dirty ? 5000 : heartbeat)) return;
            sending.current = true;
            lastContact = Date.now();
            if (dirty) setSaveState('Menyinkronkan…');
            try {
                const { data: response } = await api.put('/siswa/ujian/' + examId + '/jawaban', {
                    attemptId: data.attemptId, versi: data.versi, jawaban: data.jawaban,
                    kirim: data.send, antrean: data.versi > data.saved, securityEvents: data.security?.pending ?? []
                }, { timeout: 7000 });
                if (!active) return;
                setOffline(false);
                if (response.state === 'submitted' || response.state === 'review') {
                    stopped.current = true;
                    setReceipt(response.receipt ?? null);
                    await storeAttempt(storageKey, null).catch(() => {});
                    setResult(response.state === 'review' ? 'Jawaban menunggu tinjauan guru' : response.message || 'Jawaban terkirim');
                } else {
                    const latest = current.current;
                    const pending = (latest.security?.pending ?? []).filter(event => !(response.securityAck ?? []).includes(event.id));
                    update({ ...latest, versi: Math.max(latest.versi, response.versi), saved: response.versi,
                        savedAnswers: data.jawaban, lastSavedAt: dirty || !latest.lastSavedAt ? response.serverTime : latest.lastSavedAt,
                        security: { count: Math.max(latest.security?.count ?? 0, (response.securityCount ?? 0) + pending.filter(event => interruptsExam(event.reason)).length), pending, warning: latest.security?.warning } });
                    setSaveState('Tersimpan di server');
                }
            } catch (err) {
                if (!active) return;
                const code = isAxiosError(err) ? err.response?.data?.code : undefined;
                if (['RESET', 'HABIS', 'VERSI'].includes(code)) {
                    stopped.current = true;
                    if (code !== 'VERSI') await storeAttempt(storageKey, null).catch(() => {});
                    setResult(isAxiosError(err) ? err.response?.data?.message || 'Pengerjaan ditutup.' : 'Pengerjaan ditutup.');
                } else if (isAxiosError(err) && err.response) {
                    setSaveState(err.response.data?.message || 'Jawaban belum tersimpan.');
                } else {
                    setOffline(true);
                    setSaveState('Menunggu koneksi');
                }
            } finally { sending.current = false; }
        }
        void sync(true);
        const clock = setInterval(() => setTime(Date.now()), 1000);
        const polling = setInterval(() => void sync(), 2500);
        const onOnline = () => void sync(true);
        const onOffline = () => setOffline(true);
        window.addEventListener('online', onOnline);
        window.addEventListener('cbt-security-report', onOnline);
        window.addEventListener('offline', onOffline);
        const visibility = () => { if (!document.hidden) void sync(true); };
        document.addEventListener('visibilitychange', visibility);
        return () => {
            active = false;
            clearInterval(clock); clearInterval(polling);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('cbt-security-report', onOnline);
            window.removeEventListener('offline', onOffline);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [examId, storageKey]);

    useEffect(() => {
        if (!remain && !current.current.send && !result) update({ ...current.current, send: true, versi: current.current.versi + 1 });
    }, [remain, result]);

    const question = attempt.soal[attempt.index];
    function go(index: number) {
        update({ ...current.current, index });
        main.current?.scrollTo({ top: 0 });
        setSheet(false);
    }
    function change(value: Value) {
        if (locked || !security.ready || !question) return;
        const latest = current.current;
        update({ ...latest, jawaban: { ...latest.jawaban, [question.id]: value }, versi: latest.versi + 1 });
        setSaveState('Belum tersimpan di server');
    }
    function toggleDoubt() {
        if (!question || locked) return;
        const latest = current.current;
        update({ ...latest, ragu: latest.ragu.includes(question.id) ? latest.ragu.filter(id => id !== question.id) : [...latest.ragu, question.id] });
    }
    function finish() {
        if (locked) return;
        setConfirmFinish(false);
        update({ ...current.current, send: true, versi: current.current.versi + 1 });
    }

    if (result) return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[var(--ui-canvas)] p-4">
        <div className="ui-card my-auto w-full max-w-lg p-5 text-center sm:p-6">
            {receipt ? <CheckCircle2 size={56} className="mx-auto mb-4 text-emerald-600" /> : <ShieldAlert size={56} className="mx-auto mb-4 text-amber-600" />}
            <h1 className="ui-page-title break-words">{result}</h1>
            {receipt && <div className="mt-4"><SubmissionReceipt receipt={receipt} /></div>}
            <button className="ui-button ui-button-primary mt-4 w-full sm:w-auto" onClick={onExit}>Kembali ke Beranda</button>
        </div>
    </div>;

    if (!security.ready || (attempt.security?.count ?? 0) >= 3) return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[var(--ui-canvas)] p-4">
        <section className="ui-card my-auto w-full max-w-lg space-y-5 bg-white p-6" aria-labelledby="security-title">
            {attempt.security?.warning ? <ShieldAlert className="text-amber-600" size={48} /> : <ShieldCheck className="text-blue-600" size={48} />}
            <div><h1 id="security-title" className="ui-page-title">{locked ? 'Ujian sedang dikumpulkan' : attempt.security?.warning ? 'Peringatan keamanan ujian' : 'Aktifkan mode ujian'}</h1>
                <p className="mt-2 break-words font-semibold text-slate-800">{title}</p>
                <div className="mt-1"><ExamTypeBadge label={examType} /></div>
            </div>
            <p className="rounded-xl bg-slate-50 p-3 text-sm">{attempt.security?.warning || 'Tetap di halaman ujian dan gunakan layar penuh.'}</p>
            <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><p className="text-amber-800">Pelanggaran: {attempt.security?.count ?? 0} / 3</p><p className="text-blue-800">Sisa waktu: {Math.floor(remain / 60)}:{String(remain % 60).padStart(2, '0')}</p></div>
            <p className="text-sm text-slate-600">Pada pelanggaran ke-3, jawaban dikumpulkan otomatis.</p>
            {!security.fullscreenSupported && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Layar penuh tidak tersedia. Perpindahan tab tetap dipantau.</p>}
            {locked ? <p role="status" className="text-sm text-blue-800">{offline ? 'Menunggu koneksi. Tetap buka halaman agar jawaban dan catatan dapat dikirim.' : saveState || 'Mengirim jawaban ke server…'}</p> : <>
                {attempt.security?.warning && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />Saya memahami peringatan ini.</label>}
                {security.error && <p role="alert" className="ui-notice ui-notice-error">{security.error}</p>}
                <button type="button" disabled={security.activating || (!!attempt.security?.warning && !acknowledged)} className="ui-button ui-button-primary w-full" onClick={() => void security.activate()}>{security.activating ? 'Mengaktifkan…' : 'Masuk & Lanjutkan Ujian'}</button>
            </>}
        </section>
    </div>;

    const value = question ? attempt.jawaban[question.id] : undefined;
    const answered = attempt.soal.filter(q => answerState(q, attempt.jawaban[q.id]) === 'Terjawab').length;
    const missing = attempt.soal.filter(q => answerState(q, attempt.jawaban[q.id]) === 'Kosong').length;
    const partial = attempt.soal.length - answered - missing;
    const doubtful = !!question && attempt.ragu.includes(question.id);
    const questionNumbers = <>
        <div className="grid grid-cols-5 gap-2">
            {attempt.soal.map((q, i) => {
                const status = attempt.ragu.includes(q.id) ? 'Ragu-ragu' : answerState(q, attempt.jawaban[q.id]);
                return <button key={q.id} type="button" className="cbt-number" data-state={status}
                    aria-current={attempt.index === i ? 'step' : undefined} aria-label={'Soal ' + (i + 1) + ', ' + status}
                    onClick={() => go(i)}>{i + 1}</button>;
            })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-xs text-slate-600">
            {([
                ['bg-emerald-600', 'Terjawab'],
                ['border border-yellow-400 bg-yellow-200', 'Ragu-ragu'],
                ['border border-blue-200 bg-blue-50', 'Belum lengkap'],
                ['border border-slate-300 bg-white', 'Kosong']
            ] as const).map(([color, label]) => <span key={label} className="flex items-center gap-2"><span className={'size-3 shrink-0 rounded-sm ' + color} />{label}</span>)}
        </div>
    </>;
    const total = attempt.soal.length;
    const timer = [Math.floor(remain / 3600), Math.floor(remain % 3600 / 60), remain % 60]
        .map(unit => String(unit).padStart(2, '0')).join(':');
    const saveLabel = offline ? 'Koneksi terputus' : saveState || 'Memeriksa penyimpanan…';

    return <div className="fixed inset-0 z-[60] flex h-dvh flex-col bg-[var(--ui-canvas)]">
        <header className="shrink-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
            <div className="ui-card mx-auto max-w-6xl space-y-2.5 overflow-hidden border-l-4 border-l-blue-600 px-3 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="min-w-0 flex-1">
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-blue-700">Pengerjaan ujian</p>
                        <h1 className="mt-0.5 break-words text-lg font-bold leading-tight text-slate-900 sm:text-2xl">{title}</h1>
                        <div className="mt-1"><ExamTypeBadge label={examType} /></div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <div className={'rounded-xl px-2.5 py-1.5 ' + (remain < 300 ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-950')}>
                            <p className="flex items-center gap-1 text-[0.6875rem] font-semibold"><Clock size={12} aria-hidden="true" />Sisa waktu</p>
                            <strong role="timer" aria-label="Sisa waktu" className="block text-base leading-tight tabular-nums sm:text-lg">{timer}</strong>
                        </div>
                        <button type="button" aria-label="Buka daftar soal" aria-haspopup="dialog" aria-expanded={sheet} title="Daftar soal"
                            className="ui-button ui-button-soft ui-icon-button lg:hidden" onClick={() => setSheet(true)}>
                            <ListOrdered size={20} aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-700">{answered}/{total} soal terjawab</span>
                    <span className={offline || attempt.versi > attempt.saved ? 'text-amber-800' : 'text-slate-600'}>{saveLabel}{queuedAnswers > 0 && ' · ' + queuedAnswers + ' tertunda'}</span>
                    <span className="text-slate-600">Pelanggaran {attempt.security?.count ?? 0}/3</span>
                </div>
                <progress aria-label="Jumlah soal terjawab" value={answered} max={total || 1} className="cbt-exam-progress block h-1.5 w-full" />
            </div>
        </header>
        {(offline || storageFailed || locked) && <div className="mt-2 shrink-0 px-3 sm:px-4">
            <p role="status" className="ui-notice ui-notice-warning mx-auto max-w-6xl">
            {storageFailed ? 'Penyimpanan di perangkat gagal. Tetap buka tab dan periksa koneksi.' : !remain
                ? 'Waktu habis. Sambungkan kembali segera. Kiriman setelah batas waktu memerlukan tinjauan guru; setelah 5 menit server memakai jawaban terakhir yang tersimpan.'
                : offline ? 'Koneksi terputus. Jawaban disimpan di perangkat dan timer tetap berjalan. Jangan tutup tab; sinkronisasi dilanjutkan saat koneksi kembali.'
                : 'Jawaban sedang dikirim.'}
            </p>
        </div>}
        <main ref={main} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            <div className="cbt-exam-layout">
            {question ? <article className="ui-card min-w-0 space-y-4 p-4 sm:space-y-6 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="cbt-badge bg-blue-50 text-blue-800">Soal {attempt.index + 1}</span>
                        <span className="cbt-badge bg-slate-100 text-slate-700">{{ PG: 'Pilihan Ganda', PM: 'Pilihan Majemuk', BS: 'Benar / Salah', ISIAN: 'Isian Singkat', ESSAY: 'Essay' }[question.tipeSoal] || question.tipeSoal}</span>
                    </div>
                    <label className={'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ' +
                        (doubtful ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-700')}>
                        <input type="checkbox" checked={doubtful} disabled={locked} onChange={toggleDoubt} className="size-4 accent-amber-600" />
                        Ragu-ragu
                    </label>
                </div>
                <div className="whitespace-pre-wrap break-words text-base leading-relaxed sm:text-lg"><QuestionContent text={question.pertanyaan} image={question.gambar} /></div>
                {question.tipeSoal === 'PM' && <p className="text-sm text-slate-500">Pilih semua jawaban yang benar.</p>}
                {question.tipeSoal === 'BS' && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                    <p>Pilih Benar atau Salah untuk setiap pernyataan.</p>
                    <p className="rounded-full bg-slate-100 px-3 py-1 font-medium tabular-nums text-slate-700">
                        {question.items.filter((_, index) => Array.isArray(value) && typeof value[index] === 'boolean').length}/{question.items.length} dijawab
                    </p>
                </div>}
                <fieldset disabled={locked} className="min-w-0 space-y-2">
                    <legend className="sr-only">Jawaban</legend>
                    {(question.tipeSoal === 'PG' || question.tipeSoal === 'PM') && question.items.map((item, i) => {
                        const choices = Array.isArray(value) ? value as number[] : [];
                        const multiple = question.tipeSoal === 'PM';
                        return <label key={i} className="cbt-option">
                            <input className="mt-1 size-4 shrink-0" type={multiple ? 'checkbox' : 'radio'} name={'jawaban-' + question.id}
                                checked={multiple ? choices.includes(i) : value === i} onChange={e => change(multiple
                                    ? e.target.checked ? [...choices, i] : choices.filter(choice => choice !== i) : i)} />
                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-slate-100 text-sm font-bold" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                            <span className="min-w-0 break-words leading-relaxed"><QuestionContent text={item.teks} image={item.gambar} /></span>
                        </label>;
                    })}
                    {question.tipeSoal === 'BS' && question.items.map((item, i) => {
                        const groupId = `bs-${question.id}-${i}`;
                        const selected = Array.isArray(value) ? value[i] : null;
                        return <div key={groupId} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                            <fieldset className="min-w-0 space-y-3" aria-describedby={`${groupId}-text`}>
                                <legend className="text-xs font-semibold text-slate-600">Pernyataan {i + 1}</legend>
                                <div id={`${groupId}-text`} className="whitespace-pre-wrap break-words leading-relaxed">
                                    <QuestionContent text={item.teks} image={item.gambar} />
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                                    {[true, false].map(option => <label key={String(option)} className={'flex min-h-12 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ' +
                                        (selected === option ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-slate-300 bg-white text-slate-700') +
                                        (locked ? ' cursor-not-allowed opacity-75' : ' cursor-pointer hover:border-blue-500')}>
                                        <input type="radio" className="size-4 shrink-0 accent-blue-600" name={groupId} checked={selected === option}
                                            onChange={() => {
                                                const previous = current.current.jawaban[question.id];
                                                change(question.items.map((_, index) => index === i ? option :
                                                    Array.isArray(previous) && typeof previous[index] === 'boolean' ? previous[index] : null));
                                            }} />
                                        {option ? 'Benar' : 'Salah'}
                                    </label>)}
                                </div>
                            </fieldset>
                        </div>;
                    })}
                    {question.tipeSoal === 'ISIAN' && <input aria-label="Jawaban isian" value={typeof value === 'string' ? value : ''}
                        maxLength={12000} className="ui-input w-full border p-3" onChange={e => change(e.target.value)} />}
                    {question.tipeSoal === 'ESSAY' && <textarea aria-label="Jawaban essay" rows={8} value={typeof value === 'string' ? value : ''}
                        maxLength={12000} className="ui-input w-full border p-3" onChange={e => change(e.target.value)} />}
                </fieldset>
                {answerState(question, value) !== 'Kosong' && <button type="button" disabled={locked} className="text-sm text-blue-700 disabled:opacity-50"
                    onClick={() => {
                        const latest = current.current;
                        const jawaban = { ...latest.jawaban };
                        delete jawaban[question.id];
                        update({ ...latest, jawaban, versi: latest.versi + 1 });
                        setSaveState('Belum tersimpan di server');
                    }}>Kosongkan jawaban</button>}
            </article> : <p className="text-center">Belum ada soal.</p>}
            <aside className="ui-card sticky top-0 hidden p-5 lg:block">
                <h2 className="mb-1 font-bold">Navigasi Soal</h2><p className="mb-5 text-sm text-slate-500">{answered} dari {attempt.soal.length} soal terjawab</p>
                {questionNumbers}
            </aside>
            </div>
        </main>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2 lg:flex lg:justify-between">
                <button type="button" className={button + ' min-w-0 px-2 text-xs sm:px-4 sm:text-sm'} disabled={!attempt.index} onClick={() => go(attempt.index - 1)}><ChevronLeft size={16} className="shrink-0" aria-hidden="true" />Sebelumnya</button>
                {attempt.index < attempt.soal.length - 1 ? <button type="button" className="ui-button ui-button-primary min-w-0 px-2 text-xs sm:px-4 sm:text-sm" onClick={() => go(attempt.index + 1)}>Berikutnya<ChevronRight size={16} className="shrink-0" aria-hidden="true" /></button>
                    : question && <button type="button" className="ui-button ui-button-success min-w-0 px-2 text-xs sm:px-4 sm:text-sm" disabled={locked} onClick={() => setConfirmFinish(true)}><Send size={16} className="shrink-0" aria-hidden="true" />Kumpulkan Ujian</button>}
            </div>
        </footer>
        {sheet && <PortalDialog titleId="question-navigation" onClose={() => setSheet(false)}>
            <div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="question-navigation" className="font-bold">Navigasi Soal</h2><p className="text-sm text-slate-500">{answered} dari {attempt.soal.length} soal terjawab</p></div><button className={button} onClick={() => setSheet(false)}>Tutup</button></div>
            {questionNumbers}
        </PortalDialog>}
        {confirmFinish && !locked && <ActionDialog title="Kumpulkan ujian?" tone="success" confirmLabel="Kumpulkan" cancelLabel="Periksa Kembali"
            message="Periksa jawabanmu sebelum mengumpulkan. Jawaban yang terkirim tidak dapat diubah."
            onClose={() => setConfirmFinish(false)} onConfirm={finish}>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <dt>Terjawab lengkap</dt><dd className="text-right font-bold text-emerald-700">{answered}</dd>
                <dt>Belum dijawab</dt><dd className="text-right font-bold">{missing}</dd>
                <dt>Belum lengkap</dt><dd className="text-right font-bold">{partial}</dd>
                <dt>Ragu-ragu</dt><dd className="text-right font-bold text-yellow-800">{attempt.ragu.length}</dd>
            </dl>
        </ActionDialog>}
    </div>;
}

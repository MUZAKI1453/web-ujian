import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../../services/api';
import QuestionContent from '../guru/QuestionContent';
import { storeAttempt } from './attemptStore';
import type { LocalAttempt, Value } from './attemptStore';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, ListOrdered, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import useExamSecurity from './useExamSecurity';
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
        async function sync() {
            if (!active || stopped.current || sending.current) return;
            const data = current.current;
            const dirty = data.versi > data.saved || data.send || !!data.security?.pending.length;
            // Heartbeat also detects logout on a different device or an ended session.
            if (!navigator.onLine) { setOffline(true); return; }
            sending.current = true;
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
                        security: { count: Math.max(latest.security?.count ?? 0, (response.securityCount ?? 0) + pending.length), pending, warning: latest.security?.warning } });
                    setSaveState('Tersimpan');
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
        void sync();
        const clock = setInterval(() => setTime(Date.now()), 1000);
        const polling = setInterval(() => void sync(), 2500);
        const onOnline = () => void sync();
        const onOffline = () => setOffline(true);
        window.addEventListener('online', onOnline);
        window.addEventListener('cbt-security-report', onOnline);
        window.addEventListener('offline', onOffline);
        const visibility = () => { if (!document.hidden) void sync(); };
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

    if (result) return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-100 p-4">
        <div className="my-auto w-full max-w-lg rounded-xl bg-white p-6 text-center shadow">
            {receipt ? <CheckCircle2 size={56} className="mx-auto mb-4 text-emerald-600" /> : <ShieldAlert size={56} className="mx-auto mb-4 text-amber-600" />}
            <h1 className="text-xl font-bold">{result}</h1>
            {receipt && <div className="mt-4"><SubmissionReceipt receipt={receipt} /></div>}
            <button className={button + ' mt-4'} onClick={onExit}>Kembali ke Beranda</button>
        </div>
    </div>;

    if (!security.ready || (attempt.security?.count ?? 0) >= 3) return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-100 p-4">
        <section className="ui-card my-auto w-full max-w-lg space-y-5 bg-white p-6" aria-labelledby="security-title">
            {attempt.security?.warning ? <ShieldAlert className="text-amber-600" size={48} /> : <ShieldCheck className="text-blue-600" size={48} />}
            <div><h1 id="security-title" className="text-xl font-bold">{locked ? 'Ujian sedang dikumpulkan' : attempt.security?.warning ? 'Peringatan keamanan ujian' : 'Aktifkan mode ujian'}</h1>
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
        <label className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 text-sm font-semibold text-yellow-900">
            <input type="checkbox" checked={doubtful} disabled={locked || !question} onChange={toggleDoubt} className="size-4 accent-yellow-600" />
            Ragu-ragu
        </label>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-xs text-slate-600">
            {([['bg-emerald-600', 'Terjawab'], ['bg-yellow-200 border border-yellow-400', 'Ragu-ragu']] as const).map(([color, label]) => <span key={label} className="flex items-center gap-2"><span className={'size-3 shrink-0 rounded-sm ' + color} />{label}</span>)}
        </div>
    </>;
    return <div className="fixed inset-0 z-[60] flex h-dvh flex-col bg-slate-100">
        <header className="shrink-0 bg-blue-700 px-3 py-2.5 text-white sm:px-4 sm:py-3">
            <div className="mx-auto max-w-6xl space-y-2">
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1"><h1 className="break-words text-sm font-bold sm:text-base">{title}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5"><ExamTypeBadge label={examType} inverse />
                            <p className="text-xs text-blue-100">Soal {attempt.index + 1} / {attempt.soal.length}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1.5"><Clock size={16} className="hidden sm:block" aria-hidden="true" /><strong className={'rounded-lg px-2 py-1 font-mono text-sm sm:px-3 sm:text-lg ' + (remain < 300 ? 'bg-red-100 text-red-800' : 'bg-white/15')}>{String(Math.floor(remain / 3600)).padStart(2, '0')}:{String(Math.floor(remain % 3600 / 60)).padStart(2, '0')}:{String(remain % 60).padStart(2, '0')}</strong></span>
                        <button type="button" aria-label="Buka navigasi soal" aria-haspopup="dialog" aria-expanded={sheet} title="Navigasi soal"
                            className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 hover:bg-white/25 lg:hidden" onClick={() => setSheet(true)}>
                            <ListOrdered size={21} aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-blue-100">
                    <span className={offline || attempt.versi > attempt.saved ? 'text-amber-200' : undefined}>{offline ? 'Offline' : saveState || 'Tersimpan'}</span>
                    {queuedAnswers > 0 && <span>{queuedAnswers} menunggu sinkronisasi</span>}
                    <span className="ml-auto">Pengamanan · {attempt.security?.count ?? 0}/3</span>
                </div>
            </div>
        </header>
        {(offline || storageFailed || locked) && <div role="status" className="shrink-0 bg-amber-100 px-4 py-2 text-sm text-amber-950">
            {storageFailed ? 'Penyimpanan di perangkat gagal. Tetap buka tab dan periksa koneksi.' : !remain
                ? 'Waktu habis. Sambungkan kembali segera. Kiriman setelah batas waktu memerlukan tinjauan guru; setelah 5 menit server memakai jawaban terakhir yang tersimpan.'
                : offline ? 'Koneksi terputus. Jawaban disimpan di perangkat dan timer tetap berjalan. Jangan tutup tab; sinkronisasi dilanjutkan saat koneksi kembali.'
                : 'Jawaban sedang dikirim.'}
        </div>}
        <main ref={main} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            <div className="cbt-exam-layout">
            {question ? <article className="ui-card min-w-0 space-y-4 border bg-white p-4 sm:space-y-6 sm:p-7">
                <div className="flex items-center justify-between gap-3 border-b pb-4"><span className="cbt-badge bg-blue-600 text-white">No. {attempt.index + 1}</span><span className="cbt-badge bg-slate-100 text-slate-600">{{ PG: 'Pilihan Ganda', PM: 'Pilihan Majemuk', BS: 'Benar / Salah', ISIAN: 'Isian Singkat', ESSAY: 'Essay' }[question.tipeSoal] || question.tipeSoal}</span></div>
                <div className="whitespace-pre-wrap break-words text-base leading-relaxed sm:text-lg"><QuestionContent text={question.pertanyaan} image={question.gambar} /></div>
                {question.tipeSoal === 'PM' && <p className="text-sm text-slate-500">Pilih semua jawaban yang benar.</p>}
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
                    {question.tipeSoal === 'BS' && question.items.map((item, i) => <div key={i} className="space-y-2 rounded-lg border p-3">
                        <div><QuestionContent text={item.teks} image={item.gambar} /></div>
                        {[true, false].map(option => <label key={String(option)} className="mr-4 inline-flex items-center gap-1">
                            <input type="radio" name={'bs-' + question.id + '-' + i} checked={Array.isArray(value) && value[i] === option}
                                onChange={() => {
                                    const choices = Array.isArray(value) ? [...value] as (boolean | null)[] : question.items.map(() => null);
                                    choices[i] = option;
                                    change(choices);
                                }} /> {option ? 'Benar' : 'Salah'}
                        </label>)}
                    </div>)}
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
            <aside className="sticky top-0 hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:block">
                <h2 className="mb-1 font-bold">Navigasi Soal</h2><p className="mb-5 text-sm text-slate-500">{answered} dari {attempt.soal.length} soal terjawab</p>
                {questionNumbers}
            </aside>
            </div>
        </main>
        <footer className="shrink-0 border-t bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
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

import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../../services/api';
import QuestionContent from '../guru/QuestionContent';
import { storeAttempt } from './attemptStore';
import type { LocalAttempt, Question, Value } from './attemptStore';

const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40';

function answerState(q: Question, value: Value | undefined) {
    if (value === undefined || value === '' || (Array.isArray(value) && (!value.length || value.every(v => v === null)))) return 'Kosong';
    if (q.tipeSoal === 'BS' && Array.isArray(value) && value.some(v => v === null)) return 'Belum lengkap';
    return 'Terjawab';
}

export default function KerjakanUjian({ initial, storageKey, examId, title, preview, onExit }: {
    initial: LocalAttempt; storageKey: string; examId: number; title: string; preview: boolean; onExit: () => void;
}) {
    const [attempt, setAttempt] = useState(initial);
    const [time, setTime] = useState(Date.now());
    const [sheet, setSheet] = useState(false);
    const [result, setResult] = useState('');
    const [saveState, setSaveState] = useState('');
    const [offline, setOffline] = useState(!navigator.onLine);
    const [storageFailed, setStorageFailed] = useState(false);
    const [tabWarning, setTabWarning] = useState(false);
    const current = useRef(initial);
    const sending = useRef(false);
    const stopped = useRef(false);
    const main = useRef<HTMLElement>(null);
    const remain = Math.max(0, Math.ceil((attempt.deadline - time - attempt.offset) / 1000));
    const locked = !preview && (!remain || attempt.send);

    function update(value: LocalAttempt) {
        current.current = value;
        setAttempt(value);
        if (!preview) void storeAttempt(storageKey, value).catch(() => setStorageFailed(true));
    }

    useEffect(() => {
        if (preview) return;
        let active = true;
        async function sync() {
            if (!active || stopped.current || sending.current) return;
            const data = current.current;
            const dirty = data.versi > data.saved || data.send;
            // Heartbeat also detects logout on a different device or an ended session.
            if (!navigator.onLine) { setOffline(true); return; }
            sending.current = true;
            if (dirty) setSaveState('Menyinkronkan…');
            try {
                const { data: response } = await api.put('/siswa/ujian/' + examId + '/jawaban', {
                    attemptId: data.attemptId, versi: data.versi, jawaban: data.jawaban,
                    kirim: data.send, antrean: data.versi > data.saved
                }, { timeout: 7000 });
                if (!active) return;
                setOffline(false);
                if (response.state === 'submitted' || response.state === 'review') {
                    stopped.current = true;
                    await storeAttempt(storageKey, null).catch(() => {});
                    setResult(response.state === 'review' ? 'Jawaban menunggu tinjauan guru' : response.message || 'Jawaban terkirim');
                } else {
                    const latest = current.current;
                    update({ ...latest, versi: Math.max(latest.versi, response.versi), saved: response.versi });
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
        window.addEventListener('offline', onOffline);
        const visibility = () => {
            if (document.visibilityState === 'hidden') setTabWarning(true);
            else void sync();
        };
        document.addEventListener('visibilitychange', visibility);
        return () => {
            active = false;
            clearInterval(clock); clearInterval(polling);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [examId, preview, storageKey]);

    const question = attempt.soal[attempt.index];
    function go(index: number) {
        update({ ...current.current, index });
        main.current?.scrollTo({ top: 0 });
        setSheet(false);
    }
    function change(value: Value) {
        if (locked || !question) return;
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
        const missing = attempt.soal.filter(q => answerState(q, attempt.jawaban[q.id]) === 'Kosong').length;
        const partial = attempt.soal.filter(q => answerState(q, attempt.jawaban[q.id]) === 'Belum lengkap').length;
        if (!confirm('Kirim jawaban? ' + missing + ' kosong, ' + partial + ' belum lengkap, dan ' + attempt.ragu.length + ' ditandai ragu.')) return;
        update({ ...current.current, send: true, versi: current.current.versi + 1 });
    }

    if (result) return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-100 p-4">
        <div className="max-w-lg rounded-xl bg-white p-6 text-center shadow">
            <h1 className="text-xl font-bold">{result}</h1>
            <button className={button + ' mt-4'} onClick={onExit}>Kembali ke Beranda</button>
        </div>
    </div>;

    const value = question ? attempt.jawaban[question.id] : undefined;
    return <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
        <header className="shrink-0 bg-blue-700 px-4 py-3 text-white">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
                <div className="min-w-0"><h1 className="truncate font-bold">{title}</h1>
                    <p className="text-xs text-blue-100">{preview ? 'Pratinjau Admin' : 'Soal ' + (attempt.index + 1) + ' / ' + attempt.soal.length}</p></div>
                <div className="shrink-0 text-right text-sm">
                    {!preview && <><strong className="font-mono">{Math.floor(remain / 60)}:{String(remain % 60).padStart(2, '0')}</strong>
                    <p className={offline || attempt.versi > attempt.saved ? 'text-amber-200' : 'text-blue-100'}>{offline ? 'Offline' : saveState || 'Tersimpan'}</p></>}
                    {preview && <button className="rounded border px-2 py-1" onClick={onExit}>Tutup</button>}
                </div>
            </div>
        </header>
        {(offline || storageFailed || locked) && !preview && <div role="status" className="shrink-0 bg-amber-100 px-4 py-2 text-sm text-amber-950">
            {storageFailed ? 'Penyimpanan di perangkat gagal. Tetap buka tab dan periksa koneksi.' : !remain
                ? 'Waktu habis. Jawaban yang masih antre akan disinkronkan saat online.'
                : offline ? 'Jawaban aman di HP. Jangan tutup tab, sinkronisasi dilanjutkan saat koneksi kembali.'
                : 'Jawaban sedang dikirim.'}
        </div>}
        {tabWarning && !preview && !locked && <div role="status" className="flex shrink-0 justify-between gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-950">
            <span>Tetap di halaman ujian. Timer terus berjalan saat Anda berpindah tab.</span>
            <button type="button" className="font-semibold" onClick={() => setTabWarning(false)}>Tutup</button>
        </div>}
        <main ref={main} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {question ? <article className="mx-auto max-w-4xl space-y-4 rounded-xl bg-white p-4 shadow-sm sm:p-6">
                <p className="text-sm font-semibold text-blue-700">Soal {attempt.index + 1} · {question.tipeSoal}</p>
                <div className="whitespace-pre-wrap break-words"><QuestionContent text={question.pertanyaan} image={question.gambar} /></div>
                <fieldset disabled={locked} className="space-y-2">
                    <legend className="sr-only">Jawaban</legend>
                    {(question.tipeSoal === 'PG' || question.tipeSoal === 'PM') && question.items.map((item, i) => {
                        const choices = Array.isArray(value) ? value as number[] : [];
                        const multiple = question.tipeSoal === 'PM';
                        return <label key={i} className="flex items-start gap-3 rounded-lg border p-3">
                            <input className="mt-1" type={multiple ? 'checkbox' : 'radio'} name={'jawaban-' + question.id}
                                checked={multiple ? choices.includes(i) : value === i} onChange={e => change(multiple
                                    ? e.target.checked ? [...choices, i] : choices.filter(choice => choice !== i) : i)} />
                            <span className="min-w-0 break-words"><QuestionContent text={item.teks} image={item.gambar} /></span>
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
                        maxLength={12000} className="w-full rounded-lg border p-3" onChange={e => change(e.target.value)} />}
                    {question.tipeSoal === 'ESSAY' && <textarea aria-label="Jawaban essay" rows={8} value={typeof value === 'string' ? value : ''}
                        maxLength={12000} className="w-full rounded-lg border p-3" onChange={e => change(e.target.value)} />}
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
        </main>
        <footer className="shrink-0 border-t bg-white p-3">
            <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-2">
                <button className={button} disabled={!attempt.index} onClick={() => go(attempt.index - 1)}>Sebelum</button>
                <button className={button + (question && attempt.ragu.includes(question.id) ? ' bg-amber-100' : '')}
                    disabled={locked || !question} onClick={toggleDoubt}>Ragu</button>
                <button className={button} onClick={() => setSheet(true)}>Daftar soal</button>
                {attempt.index < attempt.soal.length - 1 ? <button className={button} onClick={() => go(attempt.index + 1)}>Lanjut</button>
                    : !preview && <button className={button + ' border-blue-700 text-blue-800'} disabled={locked} onClick={finish}>Kirim</button>}
            </div>
        </footer>
        {sheet && <div className="absolute inset-0 z-10 flex items-end bg-slate-900/40">
            <section role="dialog" aria-label="Daftar soal" className="max-h-[70vh] w-full overflow-auto rounded-t-xl bg-white p-4">
                <div className="mx-auto max-w-4xl">
                    <div className="mb-3 flex justify-between"><h2 className="font-bold">Daftar soal</h2><button className={button} onClick={() => setSheet(false)}>Tutup</button></div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {attempt.soal.map((q, i) => {
                            const status = attempt.ragu.includes(q.id) ? 'Ragu' : answerState(q, attempt.jawaban[q.id]);
                            return <button key={q.id} className={button + (status === 'Ragu' || status === 'Belum lengkap' ? ' bg-amber-50' : status === 'Terjawab' ? ' bg-green-50' : '')}
                                onClick={() => go(i)}>{i + 1}<span className="block text-xs">{status}</span></button>;
                        })}
                    </div>
                    {!preview && <button className={button + ' mt-4'} disabled={locked} onClick={finish}>Kirim jawaban</button>}
                </div>
            </section>
        </div>}
    </div>;
}

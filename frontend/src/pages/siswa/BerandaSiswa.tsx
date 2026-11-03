import { isAxiosError } from 'axios';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Bell, BookOpen, CalendarDays } from 'lucide-react';
import api from '../../services/api';
import QuestionContent from '../guru/QuestionContent';
import KerjakanUjian from './KerjakanUjian';
import { loadAttempt, storeAttempt } from './attemptStore';
import type { LocalAttempt, Question, Value } from './attemptStore';
import { errorMessage, fieldClass, primaryClass } from '../guru/QuestionEditor';

type Exam = {
    id: number; judul: string; mapel: string; durasi: number; mulai: string; selesai: string;
    susulan: boolean; status: 'Berlangsung' | 'Terjadwal' | 'Selesai' | 'Draf'; masukBuka: boolean;
    attempt: number | null; submitted: boolean; hasil: boolean; pembahasan: boolean; offline: boolean;
};
type Packet = {
    attemptId: number; deadline: number; now: number; versi: number; jawaban: Record<string, Value>; soal: Question[];
};
type Notice = { id: number; jenis: string; dibaca: boolean; ujian: { judul: string } };
type Result = { nilai: string; rincian: Record<string, { benar: number; total: number; poin: string; maksimum: string }> };
type Discussion = { soal: { id: number; pertanyaan: string; tipeSoal: string; semuaBenar: boolean; isi: {
    gambar?: string; items?: { teks: string; gambar?: string; benar: boolean }[]; jawaban?: string[]; pedoman?: string;
} | null }[] };

const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const noticeLabels: Record<string, string> = {
    'hasil-dirilis': 'Hasil dirilis', 'nilai-diperbarui': 'Nilai diperbarui', 'pembahasan-dirilis': 'Pembahasan dirilis'
};

export default function BerandaSiswa({ name, username, preview }: { name: string; username: string; preview: boolean }) {
    const [exams, setExams] = useState<Exam[]>([]);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [showNotices, setShowNotices] = useState(false);
    const [selected, setSelected] = useState<Exam | null>(null);
    const [working, setWorking] = useState<{ exam: Exam; attempt: LocalAttempt } | null>(null);
    const [output, setOutput] = useState<{ exam: Exam; result?: Result; discussion?: Discussion } | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [prepared, setPrepared] = useState<string | null>(null);

    const refresh = useCallback(async (signal?: AbortSignal) => {
        const { data } = await api.get<{ data: Exam[] }>('/siswa/ujian', { signal });
        if (signal?.aborted) return;
        setExams(data.data);
        if (!preview) {
            const notifications = await api.get<{ data: Notice[] }>('/siswa/notifikasi', { signal });
            if (!signal?.aborted) setNotices(notifications.data.data);
        }
    }, [preview]);

    useEffect(() => {
        const controller = new AbortController();
        const update = async () => {
            try { await refresh(controller.signal); }
            catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
            finally { if (!controller.signal.aborted) setLoading(false); }
        };
        void update();
        const poll = setInterval(() => void update(), 15000);
        return () => { controller.abort(); clearInterval(poll); };
    }, [refresh]);

    const key = (id: number) => username + ':' + id;

    async function enter(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selected) return;
        const token = new FormData(event.currentTarget).get('token');
        setBusy(true);
        setError('');
        try {
            if (preview) {
                const { data } = await api.get<{ soal: Question[] }>('/siswa/ujian/' + selected.id + '/preview');
                setWorking({ exam: selected, attempt: {
                    attemptId: 0, deadline: Infinity, offset: 0, versi: 0, saved: 0, jawaban: {},
                    soal: data.soal, ragu: [], index: 0, send: false
                } });
            } else {
                const local = await loadAttempt(key(selected.id)).catch(() => undefined);
                let packet: Packet;
                try {
                    const url = '/siswa/ujian/' + selected.id;
                    if (!selected.attempt && !prepared) {
                        const { data } = await api.post<{ izin: string; soal: Question[] }>(url + '/siapkan', { token }, { timeout: 12000 });
                        const images = [...new Set(data.soal.flatMap(q => [q.gambar, ...q.items.map(item => item.gambar)]).filter(Boolean))];
                        await Promise.race([
                            Promise.allSettled(images.map(source => {
                                const image = new Image();
                                image.src = source!;
                                return image.decode();
                            })),
                            new Promise(resolve => setTimeout(resolve, 5000))
                        ]);
                        setPrepared(data.izin);
                        return;
                    }
                    const { data } = await api.post<Packet>(url + '/mulai', { izin: prepared }, { timeout: 12000 });
                    packet = data;
                } catch (err) {
                    if (local && local.attemptId === selected.attempt && !selected.submitted &&
                        (!navigator.onLine || (isAxiosError(err) && !err.response) || (local.versi > local.saved && Date.now() + local.offset >= local.deadline))) {
                        setWorking({ exam: selected, attempt: local });
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
                    jawaban: queued ? same.jawaban : packet.jawaban, soal: packet.soal, ragu: same?.ragu ?? [],
                    index: Math.max(0, Math.min(same?.index ?? 0, packet.soal.length - 1)), send: same?.send ?? false
                };
                await storeAttempt(key(selected.id), attempt).catch(() => {});
                for (const source of packet.soal.flatMap(q => [q.gambar, ...q.items.map(i => i.gambar)])) {
                    if (source && !source.startsWith('data:')) { const image = new Image(); image.src = source; }
                }
                setWorking({ exam: selected, attempt });
            }
            setSelected(null);
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    async function show(exam: Exam, kind: 'hasil' | 'pembahasan') {
        setError('');
        setBusy(true);
        try {
            if (kind === 'hasil') {
                const { data } = await api.get<Result>('/siswa/ujian/' + exam.id + '/hasil');
                setOutput({ exam, result: data });
            } else {
                const { data } = await api.get<Discussion>('/siswa/ujian/' + exam.id + '/pembahasan');
                setOutput({ exam, discussion: data });
            }
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    if (working) return <KerjakanUjian initial={working.attempt} storageKey={key(working.exam.id)} examId={working.exam.id}
        title={working.exam.judul} preview={preview} onExit={() => { setWorking(null); void refresh().catch(err => setError(errorMessage(err))); }} />;

    if (output) return <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
        <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setOutput(null)}>← Kembali ke Beranda</button>
        <h1 className="text-xl font-bold">{output.exam.judul}</h1>
        {output.result && <>
            <p className="rounded-xl bg-blue-50 p-4 text-blue-900">Nilai akhir <strong className="ml-2 text-3xl">{output.result.nilai}</strong></p>
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50"><tr>{['Tipe', 'Benar / total', 'Poin / maksimum'].map(label => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
                <tbody>{Object.entries(output.result.rincian).map(([type, stat]) => <tr key={type} className="border-t">
                    <td className="p-2">{type}</td><td className="p-2">{stat.benar} / {stat.total}</td><td className="p-2">{stat.poin} / {stat.maksimum}</td>
                </tr>)}</tbody>
            </table>
        </>}
        {output.discussion?.soal.map((q, index) => <article className="space-y-2 rounded-lg border p-4" key={q.id}>
            <h2 className="font-semibold">Soal {index + 1} · {q.tipeSoal}</h2>
            <QuestionContent text={q.pertanyaan} image={q.isi?.gambar} />
            {q.semuaBenar && <p className="text-sm text-green-800">Semua jawaban diterima.</p>}
            {q.isi?.items?.map((item, i) => <div className="rounded bg-slate-50 p-2 text-sm" key={i}>
                <QuestionContent text={item.teks} image={item.gambar} /> {q.tipeSoal === 'BS' ? item.benar ? '· Benar' : '· Salah' : item.benar ? '· Kunci' : ''}
            </div>)}
            {q.isi?.jawaban && <p className="text-sm">Jawaban diterima · {q.isi.jawaban.join(' / ')}</p>}
            {q.isi?.pedoman && <p className="text-sm">Pedoman · {q.isi.pedoman}</p>}
        </article>)}
    </section>;

    return <section className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white shadow-sm">
            <div><p className="text-sm text-blue-100">Panel Siswa</p><h1 className="text-2xl font-bold">Halo, {name}</h1><p className="mt-1 text-sm text-blue-100">Lihat jadwal dan kerjakan ujian Anda.</p></div>
            {!preview && <button type="button" aria-expanded={showNotices} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm"
                onClick={() => setShowNotices(value => !value)}><Bell size={16} /> Notifikasi {notices.filter(n => !n.dibaca).length || ''}</button>}
        </header>
        {showNotices && <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Notifikasi</h2>
            {!notices.length && <p className="text-sm text-slate-600">Belum ada notifikasi.</p>}
            {notices.map(notice => <button type="button" key={notice.id} className="block w-full rounded border p-2 text-left text-sm"
                onClick={() => { if (!notice.dibaca) void api.patch('/siswa/notifikasi/' + notice.id)
                    .then(() => setNotices(items => items.map(item => item.id === notice.id ? { ...item, dibaca: true } : item)))
                    .catch(err => setError(errorMessage(err))); }}>
                <strong>{noticeLabels[notice.jenis] || notice.jenis}</strong> · {notice.ujian.judul}{notice.dibaca ? '' : ' · Baru'}
            </button>)}
        </section>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {selected && <form onSubmit={enter} className="space-y-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Instruksi · {selected.judul}</h2>
            <p className="text-sm text-slate-600">Durasi {selected.durasi} menit. Kerjakan satu soal per layar, tandai jika ragu, dan periksa jawaban sebelum mengirim.</p>
            {!preview && !selected.attempt && !prepared && <label className="block max-w-xs text-sm font-semibold">Token ujian
                <input name="token" autoComplete="off" maxLength={6} minLength={6} required className={fieldClass + ' uppercase'} />
            </label>}
            {prepared && <p role="status" className="text-sm text-green-800">Soal siap. Timer dimulai setelah Anda memilih Mulai Ujian.</p>}
            <div className="flex gap-2">
                <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setSelected(null); setPrepared(null); }}>Batal</button>
                <button type="submit" disabled={busy} className={primaryClass}>
                    {busy ? 'Menyiapkan soal…' : preview ? 'Buka Pratinjau' : selected.attempt ? 'Lanjutkan Ujian' : prepared ? 'Mulai Ujian' : 'Verifikasi Token'}
                </button>
            </div>
        </form>}
        {loading && <p role="status">Memuat daftar ujian…</p>}
        {!loading && !exams.length && <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Belum ada ujian yang tersedia.</p>}
        {(['Berlangsung', 'Terjadwal', 'Selesai', 'Draf'] as const).map(status => {
            const group = exams.filter(exam => exam.status === status);
            if (!group.length) return null;
            return <section key={status} className="space-y-3">
                <h2 className="text-lg font-bold">{status === 'Berlangsung' ? 'Ujian Berlangsung' : status === 'Terjadwal' ? 'Ujian Terjadwal' : status === 'Draf' ? 'Draf Ujian' : 'Ujian Selesai'}</h2>
                {group.map(exam => <article key={exam.id} className={'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm ' +
                    (status === 'Berlangsung' ? 'border-blue-300' : 'border-slate-200')}>
                    <div>
                        <h3 className="flex items-center gap-2 font-semibold"><BookOpen size={16} className="text-blue-700" /> {exam.judul}</h3>
                        <p className="mt-1 text-sm text-slate-600">{exam.mapel} · {exam.durasi} menit{exam.susulan ? ' · Susulan' : ''}</p>
                        <p className="mt-1 text-xs text-slate-600"><CalendarDays className="mr-1 inline" size={13} />{schedule.format(new Date(exam.mulai))} s.d. {schedule.format(new Date(exam.selesai))}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(preview || (!exam.submitted && !exam.offline && (exam.attempt || (status === 'Berlangsung' && exam.masukBuka)))) &&
                            <button type="button" disabled={busy} className={primaryClass} onClick={() => { setSelected(exam); setPrepared(null); setOutput(null); setError(''); }}>
                                {preview ? 'Preview Ujian' : exam.attempt ? 'Lanjutkan' : 'Instruksi & Token'}
                            </button>}
                        {exam.hasil && <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => void show(exam, 'hasil')}>Lihat Hasil</button>}
                        {exam.pembahasan && <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => void show(exam, 'pembahasan')}>Pembahasan</button>}
                        {!preview && exam.offline && <span className="text-sm text-amber-800">Menunggu tinjauan guru</span>}
                        {!preview && exam.submitted && !exam.hasil && !exam.offline && <span className="text-sm text-slate-600">Hasil belum tersedia</span>}
                        {!preview && status === 'Berlangsung' && !exam.masukBuka && !exam.attempt && <span className="text-sm text-slate-600">Akses masuk ditutup</span>}
                    </div>
                </article>)}
            </section>;
        })}
    </section>;
}

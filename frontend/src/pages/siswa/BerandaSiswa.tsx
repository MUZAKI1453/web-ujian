import { fieldClass, primaryClass } from '../../components/ui/styles';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bell, BookOpen, CalendarDays, ClipboardList, Clock, GraduationCap, LockKeyhole, CheckCircle2 } from 'lucide-react';
import { PortalHeader, PortalStat } from '../../components/PortalHeader';
import PortalDialog from '../../components/PortalDialog';
import api from '../../services/api';
import QuestionContent from '../guru/QuestionContent';
import KerjakanUjian from './KerjakanUjian';
import SubmissionReceipt, { type Receipt } from './SubmissionReceipt';
import { loadAttempt, storeAttempt } from './attemptStore';
import type { LocalAttempt, Question, Value } from './attemptStore';
import { errorMessage } from '../guru/QuestionEditor';

type Exam = {
    id: number; judul: string; mapel: string; durasi: number; mulai: string; selesai: string;
    susulan: boolean; status: 'Berlangsung' | 'Terjadwal' | 'Selesai' | 'Draf'; masukBuka: boolean;
    attempt: number | null; submitted: boolean; hasil: boolean; pembahasan: boolean; offline: boolean; menungguKoreksi: boolean;
};
type Packet = {
    attemptId: number; deadline: number; now: number; versi: number; jawaban: Record<string, Value>; soal: Question[]; securityCount: number;
};
type Notice = { id: number; jenis: string; dibaca: boolean; ujian: { judul: string } };
type Result = { nilai: string; rincian: Record<string, { benar: number; total: number; poin: string; maksimum: string }> };
type Discussion = { soal: { id: number; pertanyaan: string; tipeSoal: string; semuaBenar: boolean;
    jawabanSiswa: Value | null; penilaian: { poin: string; maksimum: string; status: string } | null; catatan: string | null; isi: {
    gambar?: string; items?: { teks: string; gambar?: string; benar: boolean }[]; jawaban?: string[]; pedoman?: string;
} | null }[] };

const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
function progress(exam: Exam) {
    if (exam.offline) return 'Menunggu tinjauan';
    if (exam.hasil) return 'Hasil tersedia';
    if (exam.submitted) return exam.menungguKoreksi ? 'Menunggu koreksi' : 'Sudah dikumpulkan';
    if (exam.attempt && exam.status === 'Selesai') return 'Menunggu pengumpulan';
    if (exam.attempt && exam.status !== 'Selesai') return 'Sedang dikerjakan';
    if (exam.status === 'Selesai') return 'Tidak dikumpulkan';
    return 'Belum dikerjakan';
}
const noticeLabels: Record<string, string> = {
    'hasil-dirilis': 'Hasil dirilis', 'nilai-diperbarui': 'Nilai diperbarui', 'pembahasan-dirilis': 'Pembahasan dirilis'
};

export default function BerandaSiswa({ name, username, adminMode }: { name: string; username: string; adminMode: boolean }) {
    const [exams, setExams] = useState<Exam[]>([]);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [showNotices, setShowNotices] = useState(false);
    const [selected, setSelected] = useState<Exam | null>(null);
    const [working, setWorking] = useState<{ exam: Exam; attempt: LocalAttempt; securityPrepared?: boolean } | null>(null);
    const [output, setOutput] = useState<{ exam: Exam; result?: Result; discussion?: Discussion; receipt?: Receipt } | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [prepared, setPrepared] = useState<string | null>(null);

    const refresh = useCallback(async (signal?: AbortSignal) => {
        const { data } = await api.get<{ data: Exam[] }>('/siswa/ujian', { signal });
        if (signal?.aborted) return;
        setExams(data.data);
        const notifications = await api.get<{ data: Notice[] }>('/siswa/notifikasi', { signal });
        if (!signal?.aborted) setNotices(notifications.data.data);
    }, []);

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
                security: { count: Math.max(same?.security?.count ?? 0, packet.securityCount ?? 0), pending: same?.security?.pending ?? [], warning: same?.security?.warning }
            };
            await storeAttempt(key(exam.id), attempt).catch(() => {});
            for (const source of packet.soal.flatMap(q => [q.gambar, ...q.items.map(i => i.gambar)])) {
                if (source && !source.startsWith('data:')) { const image = new Image(); image.src = source; }
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
        setError('');
        setBusy(true);
        try {
            if (kind === 'bukti') {
                const { data } = await api.get<Receipt>('/siswa/ujian/' + exam.id + '/bukti');
                setOutput({ exam, receipt: data });
            } else if (kind === 'hasil') {
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
        title={working.exam.judul} securityPrepared={working.securityPrepared} onExit={() => { setWorking(null); void refresh().catch(err => setError(errorMessage(err))); }} />;

    if (output) return <section className="ui-card space-y-4 bg-white p-5">
        <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setOutput(null)}>← Kembali ke Beranda</button>
        <h1 className="ui-page-title">{output.exam.judul}</h1>
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

    return <section className="cbt-portal cbt-student">
        <PortalHeader name={name} subtitle="Selamat datang di Panel Ujian. Persiapkan dirimu, kerjakan dengan jujur, dan raih hasil terbaik!" icon={GraduationCap}>
            <button type="button" aria-expanded={showNotices} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm"
                onClick={() => setShowNotices(value => !value)}><Bell size={16} /> Notifikasi {notices.filter(n => !n.dibaca).length || ''}</button>
        </PortalHeader>
        <div className="grid gap-4 sm:grid-cols-2">
            <PortalStat value={loading ? '—' : exams.filter(exam => !exam.submitted && exam.status !== 'Selesai' && exam.status !== 'Draf').length} label="Ujian Tersedia" icon={ClipboardList} />
            <PortalStat value={loading ? '—' : exams.filter(exam => exam.submitted && !exam.offline).length} label="Ujian Dikumpulkan" icon={CheckCircle2} green />
        </div>
        {showNotices && <section className="ui-card space-y-2 bg-white p-4">
            <h2 className="font-semibold">Notifikasi</h2>
            {!notices.length && <p className="text-sm text-slate-600">Belum ada notifikasi.</p>}
            {notices.map(notice => <button type="button" key={notice.id} className="ui-button ui-button-secondary ui-icon-button block w-full rounded border text-left"
                onClick={() => { if (!notice.dibaca) void api.patch('/siswa/notifikasi/' + notice.id)
                    .then(() => setNotices(items => items.map(item => item.id === notice.id ? { ...item, dibaca: true } : item)))
                    .catch(err => setError(errorMessage(err))); }}>
                <strong>{noticeLabels[notice.jenis] || notice.jenis}</strong> · {notice.ujian.judul}{notice.dibaca ? '' : ' · Baru'}
            </button>)}
        </section>}
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {selected && <PortalDialog titleId="exam-instructions" onClose={() => { if (!busy) { setSelected(null); setPrepared(null); } }}><form onSubmit={event => { event.preventDefault(); void enter(selected, new FormData(event.currentTarget).get('token')); }} className="space-y-5">
            <span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><ClipboardList size={28} /></span>
            <div><p className="text-sm font-semibold text-blue-600">Sebelum memulai</p><h2 id="exam-instructions" className="mt-1 text-xl font-bold">{selected.judul}</h2></div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600"><p className="font-semibold text-slate-800">Durasi ujian: {selected.durasi} menit</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Kerjakan satu soal per layar dan gunakan navigasi untuk berpindah soal.</li><li>Tandai soal yang ragu dan periksa kembali sebelum mengumpulkan.</li><li>Jawaban disimpan otomatis. Tetap di halaman ujian sampai jawaban terkirim.</li></ul></div>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {!selected.attempt && !prepared && <label className="ui-label block max-w-xs">Token ujian
                <input name="token" autoComplete="off" maxLength={6} minLength={6} required className={fieldClass + ' uppercase'} />
            </label>}
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Ujian memakai mode pengamanan. Keluar fullscreen, berpindah tab/aplikasi, atau split screen akan dicatat. Setelah 3 pelanggaran, ujian dikumpulkan otomatis.</p>
            {prepared && <p role="status" className="text-sm text-green-800">Token terverifikasi. Mulai Ujian akan menyiapkan layar penuh terlebih dahulu, lalu memulai soal dan timer.</p>}
            {(!document.documentElement.requestFullscreen || document.fullscreenEnabled === false) && <p className="text-sm text-amber-900">Browser ini tidak mendukung fullscreen. Pemantauan tab dan fokus tetap aktif.</p>}
            <div className="flex gap-2">
                <button type="button" disabled={busy} className="ui-button ui-button-secondary border" onClick={() => { setSelected(null); setPrepared(null); }}>Batal</button>
                <button type="submit" disabled={busy} className={primaryClass}>
                    {busy ? 'Menyiapkan soal…' : selected.attempt ? 'Lanjutkan Ujian' : prepared ? 'Mulai Ujian' : 'Verifikasi Token'}
                </button>
            </div>
        </form></PortalDialog>}
        {loading && <p role="status">Memuat daftar ujian…</p>}
        {!loading && !exams.length && <div className="ui-card border bg-white px-5 py-12 text-center"><ClipboardList size={52} className="mx-auto mb-4 text-slate-300" /><h2 className="text-lg font-bold">Tidak ada ujian aktif</h2><p className="mt-2 text-sm text-slate-500">Silakan cek kembali nanti atau hubungi gurumu.</p></div>}
        {['Sedang dikerjakan', 'Menunggu pengumpulan', 'Belum dikerjakan', 'Menunggu tinjauan', 'Menunggu koreksi', 'Sudah dikumpulkan', 'Hasil tersedia', 'Tidak dikumpulkan'].map(groupLabel => {
            const group = exams.filter(exam => progress(exam) === groupLabel).sort((a, b) => +new Date(a.mulai) - +new Date(b.mulai));
            if (!group.length) return null;
            return <section key={groupLabel} className="space-y-3">
                <h2 className="cbt-section-title">{groupLabel}</h2>
                <div className="grid gap-5 md:grid-cols-2">
                {group.map(exam => { const status = exam.status; return <article key={exam.id} className="cbt-exam-card" data-status={status}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="cbt-badge bg-blue-50 text-blue-600"><BookOpen size={14} />{exam.mapel}</span>
                        <span className={'cbt-badge ' + (status === 'Berlangsung' ? 'bg-emerald-100 text-emerald-800' : status === 'Terjadwal' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>{status === 'Terjadwal' ? 'Terjadwal' : progress(exam)}</span>
                    </div>
                    <h3>{exam.judul}</h3>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600"><CalendarDays size={16} />{schedule.format(new Date(exam.mulai))}</p>
                    <p className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Clock size={16} />Durasi: {exam.durasi} menit{exam.susulan ? ' · Susulan' : ''}</p>
                    <p className="mb-6 text-xs text-slate-500">Batas akhir: {schedule.format(new Date(exam.selesai))}</p>
                    <div className="mt-auto flex flex-col gap-2">
                        {(!exam.submitted && !exam.offline && (exam.attempt || (status === 'Berlangsung' && exam.masukBuka))) &&
                            <button type="button" disabled={busy} className={primaryClass + ' flex w-full items-center justify-center gap-2 py-3'} onClick={() => {
                                setOutput(null);
                                setError('');
                                if (adminMode) void enter(exam);
                                else { setSelected(exam); setPrepared(null); }
                            }}>
                                {exam.attempt ? status === 'Selesai' ? 'Sinkronkan Jawaban' : 'Lanjutkan Ujian' : 'Kerjakan Ujian'} <ArrowRight size={17} />
                            </button>}
                        {(exam.submitted || exam.offline) && <button type="button" disabled={busy} className="ui-button ui-button-secondary border" onClick={() => void show(exam, 'bukti')}>Bukti Pengumpulan</button>}
                        {exam.hasil && <button type="button" disabled={busy} className="ui-button ui-button-secondary border" onClick={() => void show(exam, 'hasil')}>Lihat Hasil</button>}
                        {exam.pembahasan && <button type="button" disabled={busy} className="ui-button ui-button-secondary border" onClick={() => void show(exam, 'pembahasan')}>Pembahasan</button>}
                        {exam.offline && <span className="text-sm text-amber-800">Menunggu tinjauan guru</span>}
                        {exam.submitted && !exam.hasil && !exam.offline && <span className="text-sm text-slate-600">{exam.menungguKoreksi ? 'Menunggu koreksi guru' : 'Jawaban sudah diterima. Hasil belum dirilis guru.'}</span>}
                        {status === 'Berlangsung' && !exam.masukBuka && !exam.attempt && <span className="text-sm text-slate-600">Akses masuk ditutup</span>}
                        {!exam.attempt && !exam.submitted && (status === 'Terjadwal' || status === 'Selesai' || status === 'Draf') && <button type="button" disabled className="ui-button ui-button-secondary flex items-center justify-center gap-2"><LockKeyhole size={17} />{status === 'Selesai' ? 'Waktu Habis' : 'Belum Dibuka'}</button>}
                    </div>
                </article>; })}
                </div>
            </section>;
        })}
    </section>;
}

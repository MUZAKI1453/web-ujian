import { useConfirmation } from '../../components/ConfirmationProvider';
import { questionTypeLabel } from './questionTypes';
import Select from '../../components/ui/Select';
import { fieldClass, primaryClass } from '../../components/ui/styles';
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from 'react';
import api from '../../services/api';
import { saveBlob } from '../../services/nativeApp';
import StudentCorrection, { type ReportRow } from './StudentCorrection';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import CorrectionKeyEditor from './CorrectionKeyEditor';
import QuestionContent from './QuestionContent';
import { Check, CircleCheck, ClipboardList, CloudDownload, Download, Eye, EyeOff, FilePenLine, KeyRound, MessageSquare, Search, SlidersHorizontal, SquarePen, Timer, Users } from 'lucide-react';
import { correctionInput } from './correctionForm';
import ModalOverlay from '../../components/ModalOverlay';
import { defaultExamSchedule } from './examDateFilter';
import OfflineReview from './OfflineReview';

type Student = { nama: string | null; username: string };
type RemedialRow = { siswa: Student & { id: number; role: string }; nilai: string | null; nilaiRemedial?: string | null };
type Report = {
    hasilRilis: boolean; bahasanRilis: boolean;
    kkm: number | null; ujianAsalId: number | null; durasiMenit: number; remedialBlockers: string[];
    candidates: RemedialRow[]; remedial: { id: number; draf: boolean; rows: RemedialRow[] } | null;
    readiness: { running: number; lastDeadline: number | null; automaticPending: number; offlinePending: number; essayPending: number; studentsPending: number; ongoing: boolean; makeupPending: number };
    history: { id: number; pelakuId: number; jenis: string; alasan?: string; status: string; waktu: string; data?: { lama?: number; baru?: number; attemptId?: number; terima?: boolean } }[];
    offline: { id: number; siswa: Student; jumlahLokal: number; jumlahServer: number }[];
    rows: ReportRow[];
};
type Impact = { naik: number; turun: number; tetap: number; revisi: number };
type Correction = { soalId: number; aksi: string; input: ReturnType<typeof correctionInput>; alasan: string };
const automaticTypes = ['PG', 'PM', 'BS', 'ISIAN', 'JODOH'] as const;

export default function ExamReport({ examId, questions, onQuestionsChanged, renderHeader, onOpenRemedial }: {
    examId: number; questions: Question[]; onQuestionsChanged: () => Promise<void>;
    renderHeader: (actions?: ReactNode) => ReactNode;
    onOpenRemedial: (id: number) => Promise<void>;
}) {
    const askConfirmation = useConfirmation();
    const [data, setData] = useState<Report | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState(0);
    const [action, setAction] = useState('ubah-kunci');
    const [preview, setPreview] = useState<{ payload: Correction; impact: Impact } | null>(null);
    const [now, setNow] = useState(Date.now());
    const [studentId, setStudentId] = useState<number | null>(null);
    const [filter, setFilter] = useState(false);
    const [search, setSearch] = useState('');
    const [remedialForm, setRemedialForm] = useState<ReturnType<typeof defaultExamSchedule> | null>(null);
    const [reviewId, setReviewId] = useState<number | null>(null);
    const url = '/guru/ujian/' + examId;
    const refresh = useCallback(async (signal?: AbortSignal) => {
        const { data } = await api.get<Report>(url + '/rekap', { signal, timeout: 10000 });
        if (!signal?.aborted) setData(data);
    }, [url]);

    useEffect(() => {
        const controller = new AbortController();
        let next: ReturnType<typeof setTimeout>;
        async function poll() {
            try { await refresh(controller.signal); }
            catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
            if (!controller.signal.aborted) next = setTimeout(poll, 5000);
        }
        void poll();
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => { controller.abort(); clearTimeout(next); clearInterval(timer); };
    }, [refresh]);

    const latestCorrection = data?.history.find(item => item.jenis === 'perbaiki-soal' && item.status === 'selesai')?.id;
    useEffect(() => {
        if (latestCorrection) void onQuestionsChanged().catch(err => setError(errorMessage(err)));
    }, [latestCorrection, onQuestionsChanged]);

    async function perform(work: () => Promise<unknown>, message?: string) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await work();
            if (message) setNotice(message);
            await refresh();
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    if (!data) return <section className="space-y-4">{renderHeader()}<p role={error ? 'alert' : 'status'}>{error || 'Memuat rekap…'}</p></section>;
    const status = data.readiness;
    const queued = data.history.some(item => item.status === 'antre');
    const failed = data.history.find(item => item.jenis === 'perbaiki-soal')?.status === 'gagal';
    const blocking = status.ongoing || status.running > 0 || queued;
    const canRelease = !blocking && !status.automaticPending && !status.essayPending && !status.offlinePending;
    const available = questions.filter(q => q.tipeSoal !== 'ESSAY' && !q.dibatalkan);
    const question = available.find(q => q.id === selected);
    const canCreateRemedial = data.remedialBlockers.length === 0 && data.candidates.length > 0;
    const offlineHistory = data.history.filter(item => item.jenis === 'tinjauan-offline');

    async function decideOffline(id: number, terima: boolean) {
        const label = terima ? 'Gunakan jawaban perangkat' : 'Gunakan jawaban server';
        if (!await askConfirmation({ title: label + '?', message: 'Versi ini akan dipakai untuk penilaian seluruh kiriman siswa.', confirmLabel: label, tone: 'warning' })) return;
        void perform(() => api.patch(url + '/offline/' + id, { terima }), 'Tinjauan offline disimpan.');
    }

    function saveKkm(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const kkm = Number(new FormData(event.currentTarget).get('kkm'));
        void perform(() => api.patch(url + '/kkm', { kkm }), 'KKM disimpan.');
    }

    function createRemedial(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const start = new Date(String(form.get('mulai')));
        const end = new Date(String(form.get('selesai')));
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || +start <= Date.now() || +end - +start < data!.durasiMenit * 60000) {
            setError('Pilih jadwal mendatang yang cukup untuk durasi ujian.');
            return;
        }
        void perform(async () => {
            const { data: created } = await api.post<{ id: number }>(url + '/remedial', {
                waktuMulai: start.toISOString(), waktuSelesai: end.toISOString()
            });
            setRemedialForm(null);
            await onOpenRemedial(created.id);
        });
    }

    function correct(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!question) return;
        const form = new FormData(event.currentTarget);
        const input = correctionInput(question.tipeSoal, question.isi?.pasangan?.length ?? question.isi?.items?.length ?? 0, form);
        const payload = { soalId: question.id, aksi: action, input, alasan: String(form.get('alasan') ?? '') };
        void perform(async () => {
            const { data } = await api.post<Impact>(url + '/perbaiki', payload);
            setPreview({ payload, impact: data });
        });
    }

    async function release(jenis: 'hasil' | 'pembahasan', rilis: boolean) {
        if (jenis === 'pembahasan' && rilis && status.makeupPending && !await askConfirmation({ title: 'Rilis pembahasan sekarang?', message: 'Masih ada peserta susulan yang belum mengerjakan.', confirmLabel: 'Rilis Pembahasan', tone: 'warning' })) return;
        void perform(() => api.patch(url + '/rilis', { jenis, rilis }), 'Pengaturan rilis disimpan.');
    }

    const releaseActions = <>
        <button type="button" className={data.hasilRilis ? 'ui-button ui-button-secondary' : 'ui-button ui-button-primary'} disabled={busy || (!data.hasilRilis && !canRelease)}
            onClick={() => release('hasil', !data.hasilRilis)}>{data.hasilRilis ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}{data.hasilRilis ? 'Sembunyikan Hasil' : 'Rilis Hasil'}</button>
        <button type="button" className={data.bahasanRilis ? 'ui-button ui-button-secondary' : primaryClass} disabled={busy || (!data.bahasanRilis && blocking)}
            onClick={() => release('pembahasan', !data.bahasanRilis)}>{data.bahasanRilis ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}{data.bahasanRilis ? 'Sembunyikan Pembahasan' : 'Rilis Pembahasan'}</button>
    </>;

    const active = data.rows.find(row => row.id === studentId);
    const keyword = search.trim().toLowerCase();
    const visible = data.rows.filter(row => (!filter || row.pending > 0) &&
        ((row.siswa.nama ?? '') + ' ' + row.siswa.username).toLowerCase().includes(keyword));

    if (active) return <section id="koreksi-siswa" className="scroll-mt-24 space-y-3">
        {renderHeader(releaseActions)}
        {error && !remedialForm && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
        <StudentCorrection key={active.id} row={active} questions={questions} busy={busy}
            onBack={() => { setStudentId(null); setError(''); setNotice(''); }}
            onSave={nilai => void perform(() => api.put(url + '/rekap/' + active.id + '/essay', { nilai }), 'Nilai esai disimpan.')} />
    </section>;

    return <section className="space-y-4">
        {renderHeader(releaseActions)}
        {error && !remedialForm && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="cbt-stat border-l-4 border-l-slate-400 bg-white">
                <span className="cbt-stat-icon bg-slate-100 text-slate-700"><FilePenLine size={28} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="!mt-0">Esai belum dinilai</p><strong className="mt-1 block text-slate-900">{status.essayPending}</strong></div>
            </div>
            <div className="cbt-stat border-l-4 border-l-blue-500 bg-white">
                <span className="cbt-stat-icon bg-blue-100 text-blue-700"><CircleCheck size={28} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="!mt-0">Penilaian otomatis</p><strong className="mt-1 block text-blue-900">{data.rows.length}<span className="text-sm font-normal text-slate-500"> / {data.rows.length + status.automaticPending}</span></strong></div>
            </div>
            <div className="cbt-stat border-l-4 border-l-blue-500 bg-white" title={status.lastDeadline ? 'Sisa ' + Math.max(0, Math.ceil((status.lastDeadline - now) / 1000)) + ' detik' : undefined}>
                <span className="cbt-stat-icon"><Timer size={28} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="!mt-0">Sedang mengerjakan</p><strong className="mt-1 block text-blue-900">{status.running}</strong></div>
            </div>
            <div className="cbt-stat border-l-4 border-l-blue-500 bg-white">
                <span className="cbt-stat-icon bg-blue-100 text-blue-700"><CloudDownload size={28} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="!mt-0">Kiriman offline</p><strong className="mt-1 block text-blue-900">{status.offlinePending}</strong></div>
            </div>
        </div>
        <div className="space-y-1 text-sm">
            {!!status.makeupPending && <p className="text-slate-800">{status.makeupPending} peserta susulan belum mengirim.</p>}
            {queued && <p>Penilaian ulang sedang antre.</p>}
            {failed && <p role="alert">Penilaian ulang gagal. Ajukan ulang perbaikan soal.</p>}
        </div>
        {data.offline.map(row => <div key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <p>Kiriman offline · {row.siswa.nama || row.siswa.username} · {row.jumlahLokal} jawaban lokal, {row.jumlahServer} di server</p>
            <button type="button" className="ui-button ui-button-secondary" aria-expanded={reviewId === row.id}
                onClick={() => setReviewId(reviewId === row.id ? null : row.id)}>{reviewId === row.id ? 'Tutup perbandingan' : 'Bandingkan jawaban'}</button>
            {reviewId === row.id && <OfflineReview key={row.id} url={url + '/offline/' + row.id} questions={questions} busy={busy}
                onDecide={terima => void decideOffline(row.id, terima)} />}
        </div>)}
        {offlineHistory.length > 0 && <details className="ui-card space-y-2 p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Riwayat tinjauan offline terbaru</summary>
            <ul className="space-y-1 text-slate-600">{offlineHistory.map(item => <li key={item.id}>
                <time dateTime={item.waktu}>{new Date(item.waktu).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</time>
                {' · Pengerjaan #' + item.data?.attemptId + ' · Jawaban ' + (item.data?.terima ? 'perangkat' : 'server') + ' digunakan'}
            </li>)}</ul>
        </details>}
        <div id="antrean-essay" className="space-y-3 rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold"><Users size={20} className="text-blue-600" aria-hidden="true" />Rekap Nilai Siswa</h3>
                <div className="ml-auto flex w-full flex-wrap items-center gap-2 xl:w-auto">
                    <div className="relative w-full min-w-0 sm:w-60">
                        <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                        <input type="search" aria-label="Cari siswa" placeholder="Cari nama atau NIS…" value={search}
                            onChange={event => setSearch(event.target.value)} className="ui-input w-full border-blue-200 bg-blue-50/40 pl-9" />
                    </div>
                    <label className={'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ' + (filter ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100')}>
                        <input type="checkbox" className="size-4 accent-slate-600" checked={filter} onChange={event => setFilter(event.target.checked)} />Belum dikoreksi
                    </label>
                <button type="button" className="ui-button ui-button-primary"
                    disabled={busy || !data.rows.length} onClick={() => void perform(async () => {
                        const { data: file } = await api.get<Blob>(url + '/rekap/excel', { responseType: 'blob' });
                        await saveBlob(file, 'rekap-ujian-' + examId + '.xlsx');
                    })}><Download size={17} aria-hidden="true" />Unduh Excel</button>
                </div>
            </div>
            {!visible.length ? <p className="text-sm text-slate-600">{data.rows.length ? 'Tidak ada siswa yang cocok.' : 'Belum ada jawaban terkirim.'}</p> :
                <div className="overflow-x-auto"><table className="ui-table w-full text-left text-sm">
                    <thead className="bg-slate-100"><tr className="divide-x divide-slate-200">{['Siswa', 'Jawaban benar', 'Poin otomatis', 'Poin esai', 'Total', 'Status', 'Aksi'].map(title =>
                        <th key={title} scope="col" className="whitespace-nowrap p-3">{title}</th>)}</tr></thead>
                    <tbody>{visible.map(row => <tr key={row.id} className="divide-x divide-slate-200 border-b">
                        <td className="p-3"><strong>{row.siswa.nama || row.siswa.username}</strong><p className="text-xs text-slate-600">{row.siswa.username}</p></td>
                        <td className="p-3">
                            {automaticTypes.some(type => row.rincian[type]) ? <ul className="flex min-w-36 flex-wrap gap-1.5">
                                {automaticTypes.map(type => {
                                    const count = row.rincian[type];
                                    return count && <li key={type} title={questionTypeLabel(type)}
                                        className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs font-medium tabular-nums text-slate-700">
                                        {type === 'ISIAN' ? 'Isian' : type === 'JODOH' ? questionTypeLabel(type) : type} <strong>{count.benar}/{count.total}</strong>
                                    </li>;
                                })}
                            </ul> : '—'}
                        </td>
                        <td className="p-3">{Object.entries(row.rincian).filter(([type]) => type !== 'ESSAY').reduce((sum, [, item]) => sum + Number(item.poin), 0).toFixed(2)}</td>
                        <td className="p-3">{row.rincian.ESSAY?.poin ?? '—'}</td>
                        <td className="p-3 font-semibold">{row.nilai}</td>
                        <td className="whitespace-nowrap p-3"><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (row.pending ? 'bg-yellow-100 text-yellow-900' : 'bg-green-50 text-green-700')}>{row.pending ? row.pending + ' esai tersisa' : 'Selesai'}</span></td>
                        <td className="p-3"><button type="button" className="ui-button ui-button-edit" onClick={() => {
                            setStudentId(row.id); setError(''); setNotice('');
                            requestAnimationFrame(() => document.getElementById('koreksi-siswa')?.scrollIntoView({ block: 'start' }));
                        }}><SquarePen size={16} aria-hidden="true" />Koreksi</button></td>
                    </tr>)}</tbody>
                </table></div>}
        </div>
        {data.ujianAsalId === null && <section className="ui-card space-y-4 bg-white p-4 sm:p-5" aria-label="KKM dan remedial">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">KKM &amp; Remedial</h3>
                    <p className="mt-1 text-sm text-slate-600">{data.kkm === null ? 'Isi KKM untuk memilih peserta otomatis.' : `KKM ${data.kkm} · ${data.remedial?.rows.length ?? data.candidates.length} peserta`}</p>
                </div>
                {data.remedial
                    ? <button type="button" className="ui-button ui-button-soft" disabled={busy} onClick={() => void onOpenRemedial(data.remedial!.id)}>{data.remedial.draf ? 'Buka Draf Remedial' : 'Buka Ujian Remedial'}</button>
                    : <form key={data.kkm} onSubmit={saveKkm} className="flex flex-wrap items-end gap-2">
                        <label className="ui-label">KKM (0–100)<input type="number" name="kkm" min="0" max="100" step="0.01" required defaultValue={data.kkm ?? ''} className="ui-input mt-1 block w-24" /></label>
                        <button type="submit" disabled={busy} className="ui-button ui-button-edit">Simpan KKM</button>
                    </form>}
            </div>
            {data.kkm !== null && !data.remedial && <div className="flex flex-wrap items-start justify-between gap-3">
                <div id="remedial-requirements" className="space-y-2 text-sm text-slate-600">
                    <p>{data.candidates.length ? 'Peserta dengan nilai final di bawah KKM otomatis dipilih.' : 'Belum ada peserta dengan nilai final di bawah KKM.'}</p>
                    {data.remedialBlockers.length > 0 && <ul className="list-disc space-y-1 pl-5">
                        {data.remedialBlockers.map(message => <li key={message}>{message}</li>)}
                    </ul>}
                </div>
                <button type="button" className={primaryClass} disabled={busy || !canCreateRemedial} aria-describedby="remedial-requirements"
                    onClick={() => { setError(''); setRemedialForm(defaultExamSchedule(data.durasiMenit)); }}>Buat Draf Remedial</button>
            </div>}
            {(data.remedial?.rows.length || data.candidates.length) > 0 && <details className="rounded-xl border border-slate-200 p-3" open={data.remedial ? true : undefined}>
                <summary className="cursor-pointer text-sm font-semibold">{data.remedial ? 'Nilai awal dan remedial' : 'Lihat peserta otomatis'}</summary>
                <div className="mt-2 overflow-x-auto"><table className="ui-table w-full">
                    <thead><tr><th scope="col">Siswa</th><th scope="col">Nilai awal</th>{data.remedial && <th scope="col">Nilai remedial</th>}</tr></thead>
                    <tbody>{(data.remedial?.rows ?? data.candidates).map(row => <tr key={row.siswa.id}><td>{row.siswa.nama || row.siswa.username}{row.siswa.role === 'admin' && <span className="ml-2 text-xs text-slate-500">Admin uji coba</span>}</td><td>{row.nilai ?? '—'}</td>{data.remedial && <td>{row.nilaiRemedial ?? '—'}</td>}</tr>)}</tbody>
                </table></div>
            </details>}
        </section>}
        {remedialForm && <ModalOverlay label="Buat draf remedial" onClose={() => { if (!busy) { setRemedialForm(null); setError(''); } }}>
            <section className="ui-dialog-panel max-w-lg space-y-4">
                <h3 className="text-lg font-bold">Buat Draf Remedial</h3>
                <p className="text-sm text-slate-600">{data.candidates.length} peserta otomatis · {data.durasiMenit} menit. Soal aktif dari ujian asal disalin ke draf.</p>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <form onSubmit={createRemedial} className="space-y-4">
                    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
                        <label className="ui-label">Waktu mulai<input type="datetime-local" name="mulai" defaultValue={remedialForm.start} required className={fieldClass} /></label>
                        <label className="ui-label">Waktu selesai<input type="datetime-local" name="selesai" defaultValue={remedialForm.end} required className={fieldClass} /></label>
                    </fieldset>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={() => { setRemedialForm(null); setError(''); }}>Batal</button>
                        <button type="submit" className={primaryClass} disabled={busy || !canCreateRemedial}>{busy ? 'Menyimpan…' : 'Buat Draf'}</button>
                    </div>
                </form>
            </section>
        </ModalOverlay>}
        {!status.ongoing && !!available.length && <form onSubmit={correct} className="ui-card space-y-4 bg-white p-5" aria-label="Perbaiki kunci soal">
            <fieldset disabled={busy || queued} className="space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><KeyRound size={18} className="text-blue-700" aria-hidden="true" />Perbaiki Soal</h3>
            <div className="grid items-end gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <label className="ui-label block"><span className="flex items-center gap-1.5"><ClipboardList size={16} className="text-blue-600" aria-hidden="true" />Pilih soal</span>
                <Select aria-label="Pilih soal untuk diperbaiki" value={selected} className={fieldClass} onValueChange={e => { setSelected(Number(e)); setAction('ubah-kunci'); setPreview(null); }}>
                    <option value={0}>Pilih soal</option>
                    {available.map(q => <option key={q.id} value={q.id}>{'Soal ' + (questions.indexOf(q) + 1) + ' · ' + questionTypeLabel(q.tipeSoal) + ' · ' + q.pertanyaan.slice(0, 80)}</option>)}
                </Select>
            </label>
            {question && <label className="ui-label block"><span className="flex items-center gap-1.5"><SlidersHorizontal size={16} className="text-blue-600" aria-hidden="true" />Tindakan</span>
                <Select aria-label="Tindakan perbaikan soal" className={fieldClass} value={action} onValueChange={e => { setAction(e); setPreview(null); }}>
                    <option value="ubah-kunci">Ubah kunci</option><option value="terima-semua">Terima semua jawaban</option>
                    {question.tipeSoal === 'ISIAN' && <option value="tambah-jawaban">Tambah alternatif jawaban</option>}
                    <option value="batalkan">Batalkan soal</option>
                </Select>
            </label>}
            </div>
            {question && <>
                <article className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="flex flex-wrap items-center gap-3 font-semibold">Soal {questions.indexOf(question) + 1}<span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">{questionTypeLabel(question.tipeSoal)}</span></h4>
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed"><QuestionContent text={question.pertanyaan} image={question.isi?.gambar} /></div>
                    {question.tipeSoal === 'PG' && <ol className="space-y-2">{question.isi?.items?.map((item, index) => <li key={index} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <span className="font-semibold text-slate-500">{String.fromCharCode(65 + index)}.</span><div className="min-w-0 break-words"><QuestionContent text={item.teks} image={item.gambar} /></div>
                    </li>)}</ol>}
                </article>
                {(action === 'ubah-kunci' || action === 'tambah-jawaban') && <CorrectionKeyEditor key={question.id + ':' + action} question={question} append={action === 'tambah-jawaban'} onChange={() => setPreview(null)} />}
                <label className="ui-label block rounded-xl border border-slate-200 bg-slate-50 p-4"><span className="flex items-center gap-1.5"><MessageSquare size={16} className="text-slate-500" aria-hidden="true" />Alasan perubahan</span>
                    <textarea name="alasan" required maxLength={2000} rows={2} className={fieldClass} placeholder="Jelaskan alasan perbaikan…" onChange={() => setPreview(null)} />
                </label>
                <button type="submit" disabled={busy || queued} className="ui-button ui-button-secondary border"><Eye size={17} aria-hidden="true" />Preview Dampak</button>
                {preview && <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4" role="status">
                    <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-lg bg-white px-3 py-2 text-green-700">{preview.impact.naik} naik</span><span className="rounded-lg bg-white px-3 py-2 text-red-700">{preview.impact.turun} turun</span><span className="rounded-lg bg-white px-3 py-2 text-slate-600">{preview.impact.tetap} tetap</span></div>
                    <button type="button" disabled={busy || queued} className={primaryClass} onClick={async () => {
                        if (!await askConfirmation({ title: 'Terapkan perbaikan soal?', message: 'Nilai siswa akan dihitung ulang berdasarkan perubahan ini.', confirmLabel: 'Terapkan Perbaikan', tone: 'warning' })) return;
                        void perform(async () => {
                            await api.post(url + '/perbaiki', { ...preview.payload, konfirmasi: true, revisi: preview.impact.revisi });
                            setPreview(null);
                        }, 'Penilaian ulang masuk antrean.');
                    }}><Check size={17} aria-hidden="true" />Konfirmasi Perbaikan</button>
                </div>}
            </>}
            </fieldset>
        </form>}
    </section>;
}

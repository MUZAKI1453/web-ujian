import Select from '../../components/ui/Select';
import { fieldClass, primaryClass } from '../../components/ui/styles';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import StudentCorrection, { type ReportRow } from './StudentCorrection';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';

type Student = { nama: string | null; username: string };
type Report = {
    hasilRilis: boolean; bahasanRilis: boolean;
    readiness: { running: number; lastDeadline: number | null; automaticPending: number; offlinePending: number; essayPending: number; studentsPending: number; ongoing: boolean; makeupPending: number };
    history: { id: number; pelakuId: number; jenis: string; alasan?: string; status: string; waktu: string; data?: { lama?: number; baru?: number } }[];
    offline: { id: number; siswa: Student; jumlahLokal: number; jumlahServer: number }[];
    rows: ReportRow[];
};
type Impact = { naik: number; turun: number; tetap: number; revisi: number };
type Correction = { soalId: number; aksi: string; input?: boolean[] | string; alasan: string };

export default function ExamReport({ examId, questions, onQuestionsChanged }: {
    examId: number; questions: Question[]; onQuestionsChanged: () => Promise<void>;
}) {
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

    if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Memuat rekap…'}</p>;
    const status = data.readiness;
    const queued = data.history.some(item => item.status === 'antre');
    const failed = data.history.some(item => item.status === 'gagal');
    const blocking = status.ongoing || status.running > 0 || queued;
    const canRelease = !blocking && !status.automaticPending && !status.essayPending && !status.offlinePending;
    const available = questions.filter(q => q.tipeSoal !== 'ESSAY' && !q.dibatalkan);
    const question = available.find(q => q.id === selected);

    function correct(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!question) return;
        const form = new FormData(event.currentTarget);
        const input = question.tipeSoal === 'ISIAN' ? String(form.get('jawaban') ?? '') :
            question.isi?.items?.map((_, i) => form.get('item-' + i) === 'true');
        const payload = { soalId: question.id, aksi: action, input, alasan: String(form.get('alasan') ?? '') };
        void perform(async () => {
            const { data } = await api.post<Impact>(url + '/perbaiki', payload);
            setPreview({ payload, impact: data });
        });
    }

    function release(jenis: 'hasil' | 'pembahasan', rilis: boolean) {
        if (jenis === 'pembahasan' && rilis && status.makeupPending && !confirm('Ada peserta susulan yang belum mengerjakan. Rilis pembahasan sekarang?')) return;
        void perform(() => api.patch(url + '/rilis', { jenis, rilis }), 'Pengaturan rilis disimpan.');
    }

    const active = data.rows.find(row => row.id === studentId);
    const keyword = search.trim().toLowerCase();
    const visible = data.rows.filter(row => (!filter || row.pending > 0) &&
        ((row.siswa.nama ?? '') + ' ' + row.siswa.username).toLowerCase().includes(keyword));

    if (active) return <section id="koreksi-siswa" className="scroll-mt-24 space-y-3">
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
        <StudentCorrection key={active.id} row={active} questions={questions} busy={busy}
            onBack={() => { setStudentId(null); setError(''); setNotice(''); }}
            onSave={nilai => void perform(() => api.put(url + '/rekap/' + active.id + '/essay', { nilai }), 'Nilai essay disimpan.')} />
    </section>;

    return <section className="space-y-4 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Rekap, koreksi, dan rilis</h2>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <p>Essay belum dikoreksi: {status.essayPending} soal dari {status.studentsPending} siswa</p>
            <p>Penilaian otomatis: {data.rows.length} dari {data.rows.length + status.automaticPending} selesai</p>
            <p>Masih mengerjakan: {status.running}{status.lastDeadline ? ' · sisa ' + Math.max(0, Math.ceil((status.lastDeadline - now) / 1000)) + ' detik' : ''}</p>
            <p>Kiriman offline menunggu tinjauan: {status.offlinePending}</p>
            {!!status.makeupPending && <p className="text-amber-800">{status.makeupPending} peserta susulan belum mengirim.</p>}
            {queued && <p>Penilaian ulang sedang antre.</p>}
            {failed && <p role="alert">Ada penilaian ulang yang gagal. Periksa riwayat dan ajukan ulang bila perlu.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryClass} disabled={busy || (!data.hasilRilis && !canRelease)}
                onClick={() => release('hasil', !data.hasilRilis)}>{data.hasilRilis ? 'Sembunyikan Hasil' : 'Rilis Hasil'}</button>
            <button type="button" className={primaryClass} disabled={busy || (!data.bahasanRilis && blocking)}
                onClick={() => release('pembahasan', !data.bahasanRilis)}>{data.bahasanRilis ? 'Sembunyikan Pembahasan' : 'Rilis Pembahasan'}</button>
            {status.essayPending > 0 && <a href="#antrean-essay" onClick={() => setFilter(true)} className="self-center text-sm font-semibold text-blue-700">Buka antrean koreksi</a>}
        </div>
        {data.offline.map(row => <div key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <p>Kiriman offline · {row.siswa.nama || row.siswa.username} · {row.jumlahLokal} jawaban lokal, {row.jumlahServer} di server</p>
            <div className="flex gap-3">
                <button type="button" disabled={busy} className="text-blue-700" onClick={() => void perform(() => api.patch(url + '/offline/' + row.id, { terima: true }))}>Terima kiriman</button>
                <button type="button" disabled={busy} className="text-blue-700" onClick={() => void perform(() => api.patch(url + '/offline/' + row.id, { terima: false }))}>Gunakan jawaban server</button>
            </div>
        </div>)}
        <div id="antrean-essay" className="space-y-3 rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Rekap Nilai Siswa</h3>
                <button type="button" className="ui-button ui-button-secondary border"
                    disabled={busy || !data.rows.length} onClick={() => void perform(async () => {
                        const { data: file } = await api.get<Blob>(url + '/rekap/excel', { responseType: 'blob' });
                        const href = URL.createObjectURL(file);
                        const link = document.createElement('a');
                        link.href = href;
                        link.download = 'rekap-ujian-' + examId + '.xlsx';
                        link.click();
                        setTimeout(() => URL.revokeObjectURL(href), 1000);
                    })}>Unduh Excel</button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <input type="search" aria-label="Cari siswa" placeholder="Cari nama atau NIS" value={search}
                    onChange={event => setSearch(event.target.value)} className="ui-input border" />
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filter} onChange={event => setFilter(event.target.checked)} /> Belum dikoreksi
                </label>
            </div>
            {!visible.length ? <p className="text-sm text-slate-600">{data.rows.length ? 'Tidak ada siswa yang cocok.' : 'Belum ada jawaban terkirim.'}</p> :
                <div className="overflow-x-auto"><table className="ui-table w-full text-left text-sm">
                    <thead className="bg-slate-100"><tr>{['Siswa', 'Poin otomatis', 'Poin essay', 'Total', 'Status', 'Aksi'].map(title =>
                        <th key={title} scope="col" className="whitespace-nowrap p-3">{title}</th>)}</tr></thead>
                    <tbody>{visible.map(row => <tr key={row.id} className="border-b">
                        <td className="p-3"><strong>{row.siswa.nama || row.siswa.username}</strong><p className="text-xs text-slate-600">{row.siswa.username}</p></td>
                        <td className="p-3">{Object.entries(row.rincian).filter(([type]) => type !== 'ESSAY').reduce((sum, [, item]) => sum + Number(item.poin), 0).toFixed(2)}</td>
                        <td className="p-3">{row.rincian.ESSAY?.poin ?? '—'}</td>
                        <td className="p-3 font-semibold">{row.nilai}</td>
                        <td className="whitespace-nowrap p-3">{row.pending ? row.pending + ' essay tersisa' : 'Selesai'}</td>
                        <td className="p-3"><button type="button" className={primaryClass} onClick={() => {
                            setStudentId(row.id); setError(''); setNotice('');
                            requestAnimationFrame(() => document.getElementById('koreksi-siswa')?.scrollIntoView({ block: 'start' }));
                        }}>Koreksi</button></td>
                    </tr>)}</tbody>
                </table></div>}
        </div>
        {!status.ongoing && !!available.length && <form onSubmit={correct} className="space-y-3 rounded-lg border p-3 text-sm">
            <h3 className="font-semibold">Perbaiki Soal</h3>
            <label className="ui-label block">Soal
                <Select value={selected} className={fieldClass} onValueChange={e => { setSelected(Number(e)); setAction('ubah-kunci'); setPreview(null); }}>
                    <option value={0}>Pilih soal</option>
                    {available.map(q => <option key={q.id} value={q.id}>{q.tipeSoal} · {q.pertanyaan.slice(0, 100)}</option>)}
                </Select>
            </label>
            {question && <>
                <label className="ui-label block">Tindakan
                    <Select className={fieldClass} value={action} onValueChange={e => { setAction(e); setPreview(null); }}>
                        <option value="ubah-kunci">Ubah kunci</option>
                        <option value="terima-semua">Terima semua jawaban</option>
                        {question.tipeSoal === 'ISIAN' && <option value="tambah-jawaban">Tambah jawaban diterima</option>}
                        <option value="batalkan">Batalkan soal</option>
                    </Select>
                </label>
                {(action === 'ubah-kunci' || action === 'tambah-jawaban') && (question.tipeSoal === 'ISIAN'
                    ? <label className="ui-label block">Jawaban diterima (satu per baris)<textarea name="jawaban" required className={fieldClass} onChange={() => setPreview(null)} /></label>
                    : <fieldset key={question.id}>
                        <legend>Kunci baru</legend>
                        {question.isi?.items?.map((item, index) => <label className="ui-label block" key={index}>
                            <Select name={'item-' + index} defaultValue={String(item.benar)} onValueChange={() => setPreview(null)} className="ui-input mr-2 rounded border">
                                <option value="true">Benar</option><option value="false">Salah</option>
                            </Select>{item.teks}
                        </label>)}
                    </fieldset>)}
                <label className="ui-label block">Alasan<input name="alasan" required maxLength={2000} className={fieldClass} onChange={() => setPreview(null)} /></label>
                <button type="submit" disabled={busy || queued} className={primaryClass}>Pratinjau Dampak</button>
                {preview && <div className="space-y-2" role="status">
                    <p>{preview.impact.naik} naik · {preview.impact.turun} turun · {preview.impact.tetap} tetap</p>
                    <button type="button" disabled={busy || queued} className={primaryClass} onClick={() => {
                        if (!confirm('Terapkan perbaikan dan antrekan penilaian ulang?')) return;
                        void perform(async () => {
                            await api.post(url + '/perbaiki', { ...preview.payload, konfirmasi: true, revisi: preview.impact.revisi });
                            setPreview(null);
                        }, 'Penilaian ulang masuk antrean.');
                    }}>Konfirmasi Perbaikan</button>
                </div>}
            </>}
        </form>}
        <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Riwayat perubahan</summary>
            {data.history.map(item => <p key={item.id} className="mt-2 border-t pt-2">
                {new Date(item.waktu).toLocaleString('id-ID')} · {item.jenis} · {item.status} · akun #{item.pelakuId}
                {item.data?.baru !== undefined && ' · ' + (item.data.lama ?? '—') + ' → ' + item.data.baru}
                {item.alasan && ' · ' + item.alasan}
            </p>)}
        </details>
    </section>;
}

import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, Eye, Laptop, Plus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import QuestionEditor, { errorMessage, fieldClass, primaryClass } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import ImportSoal from './ImportSoal';
import QuestionContent from './QuestionContent';
import PublishExam, { specialPointTypes, type PointSettings } from './PublishExam';
import ExamSessions from './ExamSessions';
import ExamReport from './ExamReport';

interface Exam {
    id: number;
    judul: string;
    mapel: { nama: string };
    kelas: { namaKelas: string };
    durasiMenit: number;
    waktuMulai: string;
    waktuSelesai: string;
    draf: boolean;
}
type ExamRow = Exam & { _count: { soal: number } };
type ExamDetail = Exam & { soal: Question[] };
type Assignment = { mapel: { id: number; nama: string }; kelas: { id: number; namaKelas: string } };

const questionGroups = [
    ['PG', 'Pilihan Ganda'], ['PM', 'Pilihan Majemuk'], ['BS', 'Benar / Salah'],
    ['ISIAN', 'Isian'], ['ESSAY', 'Essay']
] as const;
const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
type ExamTab = 'soal' | 'sesi' | 'rekap';
const defaultDuration = 120;

function optionLabel(index: number): string {
    const letter = String.fromCharCode(65 + index % 26);
    return index < 26 ? letter : optionLabel(Math.floor(index / 26) - 1) + letter;
}

function defaultSchedule() {
    const start = new Date();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + defaultDuration * 60_000);
    const localInput = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    return { start: localInput(start), end: localInput(end) };
}

export default function UjianGuru({ name }: { name: string }) {
    const [tab, setTab] = useState<ExamTab>('soal');
    const [subject, setSubject] = useState('');
    const [search, setSearch] = useState('');
    const [exams, setExams] = useState<ExamRow[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [exam, setExam] = useState<ExamDetail | null>(null);
    const [editor, setEditor] = useState<{ question: Question | null } | null>(null);
    const [creating, setCreating] = useState(false);
    const [draftSchedule, setDraftSchedule] = useState(defaultSchedule);
    const [pointSettings, setPointSettings] = useState<PointSettings>({});
    const draftTitle = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {

        const controller = new AbortController();
        api.get<{ ujian: ExamRow[]; penugasan: Assignment[] }>('/guru/ujian', { signal: controller.signal })
            .then(({ data }) => {
                setExams(data.ujian);
                setAssignments(data.penugasan);
            })
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (creating) draftTitle.current?.focus();
    }, [creating, subject]);

    async function createExam(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        const form = new FormData(event.currentTarget);
        const [mapelId, kelasId] = String(form.get('penugasan')).split(':').map(Number);
        try {
            const { data } = await api.post<ExamRow>('/guru/ujian', {
                judul: form.get('judul'), mapelId, kelasId, durasiMenit: Number(form.get('durasi')),
                waktuMulai: new Date(String(form.get('mulai'))).toISOString(),
                waktuSelesai: new Date(String(form.get('selesai'))).toISOString()
            });
            setExams(current => [data, ...current]);
            setTab('soal');
            setPointSettings({});
            setExam({ ...data, soal: [] });
            setCreating(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function openExam(id: number) {
        setBusy(true);
        setError('');
        try {
            const { data } = await api.get<ExamDetail>('/guru/ujian/' + id);
            setTab('soal');
            setPointSettings({});
            setExam(data);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    const examId = exam?.id;
    const refreshQuestions = useCallback(async () => {
        if (!examId) return;
        const { data } = await api.get<ExamDetail>('/guru/ujian/' + examId);
        setExam(current => current?.id === examId ? data : current);
    }, [examId]);

    function saveQuestion(question: Question) {
        if (!exam) return;
        const soal = editor?.question
            ? exam.soal.map(item => item.id === question.id ? question : item)
            : [...exam.soal, question];
        updateQuestions(soal);
        setEditor(null);
    }

    function updateQuestions(soal: Question[]) {
        if (!exam) return;
        setExam({ ...exam, soal });
        setExams(current => current.map(item => item.id === exam.id ? { ...item, _count: { soal: soal.length } } : item));
    }

    const subjects = [...new Map(assignments.map(pair => [pair.mapel.id, pair.mapel])).values()];
    const formPairs = assignments.filter(pair => !subject || String(pair.mapel.id) === subject);
    const matches = exams.filter(item => (item.judul + ' ' + item.mapel.nama + ' ' + item.kelas.namaKelas).toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <section className="space-y-5">
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {exam ? (
                <>
                    <button type="button" className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => { setExam(null); setNotice(''); }}><ArrowLeft size={16} /> Kembali ke Ujian Saya</button>
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div>
                            <p className="text-sm font-semibold text-blue-700">Preview Ujian</p>
                            <h1 className="text-2xl font-bold text-slate-800">{exam.judul}</h1>
                            <p className="text-sm text-slate-600">{exam.mapel.nama} · {exam.kelas.namaKelas} · {exam.durasiMenit} menit · {exam.draf ? 'Draf' : 'Terbit'}</p>
                        </div>
                        {exam.draf && <div className="flex flex-wrap gap-2">
                            <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold text-blue-700"
                                onClick={() => { setNotice(''); setImporting(true); }}>Impor Excel</button>
                            <button type="button" className={primaryClass} onClick={() => setEditor({ question: null })}>Tambah Soal</button>
                        </div>}
                    </div>
                    {exam.draf && <PublishExam key={JSON.stringify([pointSettings, exam.soal.map(q => [q.id, q.bobot, q.tipeSoal])])}
                        examId={exam.id} settings={pointSettings} hasQuestions={exam.soal.length > 0} onPublish={updated => {
                            setExam({ ...exam, draf: false, soal: updated });
                            setExams(current => current.map(item => item.id === exam.id ? { ...item, draf: false } : item));
                            setNotice('Ujian berhasil diterbitkan.');
                        }} />}
                    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
                    {!exam.draf && <nav aria-label="Bagian ujian" className="flex flex-wrap gap-1 rounded-xl border bg-white p-1.5">
                        {([['soal', 'Preview Soal'], ['sesi', 'Sesi & Peserta'], ['rekap', 'Koreksi & Rekap']] as const).map(([key, label]) => (
                            <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
                                className={'rounded-lg px-3 py-2 text-sm font-semibold ' + (tab === key ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100')}>{label}</button>
                        ))}
                    </nav>}
                    {tab === 'soal' && !exam.soal.length && <p className="text-sm text-slate-600">Belum ada soal. Pilih Tambah Soal untuk mulai.</p>}
                    {tab === 'soal' && [...questionGroups, ['lainnya', 'Soal Lainnya']].map(([type, label]) => {
                        const questions = exam.soal.map((question, index) => ({ question, index })).filter(({ question }) =>
                            type === 'lainnya' ? !questionGroups.some(([known]) => known === question.tipeSoal.toUpperCase()) : question.tipeSoal.toUpperCase() === type);
                        if (!questions.length) return null;
                        const special = specialPointTypes.find(item => item === type);
                        return <section key={type} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <h2 className={'flex items-center justify-between px-4 py-3 font-semibold ' + (type === 'ESSAY' ? 'bg-amber-300 text-slate-900' : 'bg-blue-700 text-white')}>
                                {label}<span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{questions.length} soal</span>
                            </h2>
                            {exam.draf && <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                {special ? <>
                                    <label className="flex items-center gap-2 font-medium">
                                        <input type="checkbox" checked={pointSettings[special] !== undefined}
                                            onChange={event => setPointSettings(current => ({ ...current, [special]: event.target.checked ? '1' : undefined }))} />
                                        Tetapkan poin per soal
                                    </label>
                                    {pointSettings[special] !== undefined ? <input type="number" min="0.0001" max="100" step="0.0001"
                                        aria-label={'Poin per soal ' + label} value={pointSettings[special]}
                                        onChange={event => setPointSettings(current => ({ ...current, [special]: event.target.value }))}
                                        className="w-24 rounded-lg border bg-white p-1" /> : <span>Poin dibagi rata dari sisa total.</span>}
                                </> : <span>{type === 'ESSAY' ? 'Atur poin maksimum pada masing-masing soal essay.' : 'Poin dibagi rata dari sisa total.'}</span>}
                            </div>}
                            <div className="divide-y divide-slate-200">{questions.map(({ question, index }) => (
                        <article key={question.id} className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-2">
                                <h2 className="flex flex-wrap items-center gap-2 font-semibold"><span className="grid min-h-8 min-w-8 place-items-center rounded-full bg-blue-700 px-1 text-sm text-white">{index + 1}</span> Soal{question.dibatalkan && <span className="ml-2 text-xs text-red-700">Dibatalkan</span>}</h2>
                                {exam.draf && <button type="button" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                                    aria-label={'Edit Soal ' + (index + 1)} onClick={() => setEditor({ question })}>Edit Soal</button>}
                            </div>
                            <div className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed"><QuestionContent text={question.pertanyaan} image={question.isi?.gambar} /></div>
                            {!!question.isi?.items?.length && <ol className="mt-3 space-y-1">
                                {question.isi.items.map((item, i) => (
                                    <li key={i} className={'flex items-start gap-2 rounded-lg px-3 py-2 text-sm ' +
                                        (item.benar ? 'bg-emerald-50 text-emerald-900' : type === 'BS' ? 'bg-red-50 text-red-900' : 'bg-slate-50')}>
                                        {type === 'PG' && <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white font-semibold">
                                            {optionLabel(i)}
                                        </span>}
                                        <div className="min-w-0 flex-1 break-words"><QuestionContent text={item.teks} image={item.gambar} /></div>
                                        {type === 'BS' ? <span className="sr-only">{item.benar ? 'Benar' : 'Salah'}</span>
                                            : item.benar && <span className="shrink-0 font-semibold">Kunci</span>}
                                    </li>
                                ))}
                            </ol>}
                            {type === 'ISIAN' && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                                <p className="font-semibold">Jawaban diterima {question.isi?.angka && <span className="font-normal">· Angka</span>}</p>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {question.isi?.jawaban?.map((answer, i) => <li key={i} className="max-w-full whitespace-pre-wrap break-words rounded-lg border border-emerald-200 bg-white px-3 py-1.5">{answer}</li>)}
                                </ul>
                            </div>}
                            {!exam.draf && question.tipeSoal !== 'ESSAY' && <p className="mt-2 text-sm">Poin maksimum · {question.bobot}</p>}
                            {type === 'ESSAY' && <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-950">
                                <span>Poin maksimum</span><strong className="rounded-full bg-amber-200 px-2 py-0.5">{Number(question.bobot)}</strong>
                            </div>}
                        </article>
                            ))}</div>
                        </section>;
                    })}
                    {!exam.draf && <><div hidden={tab !== 'sesi'}><ExamSessions examId={exam.id} /></div><div hidden={tab !== 'rekap'}><ExamReport examId={exam.id} questions={exam.soal} onQuestionsChanged={refreshQuestions} /></div></>}
                    {importing && <ImportSoal examId={exam.id} onClose={() => setImporting(false)} onImport={questions => {
                        updateQuestions([...exam.soal, ...questions]);
                        setNotice(questions.length + ' soal berhasil diimpor.');
                        setImporting(false);
                    }} />}
                    {editor && <QuestionEditor examId={exam.id} question={editor.question} onClose={() => setEditor(null)} onSave={saveQuestion} />}
                </>
            ) : (
                <>
                    <header className="flex items-center justify-between gap-6 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-7 text-white shadow-sm sm:px-8">
                        <div>
                            <p className="text-sm font-semibold text-blue-100">Panel Guru</p>
                            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Halo, {name || 'Guru'}</h1>
                            <p className="mt-2 text-sm text-blue-100">Kelola soal, jadwal ujian, dan nilai siswa.</p>
                        </div>
                        <Laptop className="hidden text-blue-200 sm:block" size={64} strokeWidth={1.5} aria-hidden="true" />
                    </header>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[[subjects.length, 'Mata pelajaran'], [exams.length, 'Ujian saya'], [exams.filter(item => item.draf).length, 'Draf']].map(([value, title]) => (
                            <div key={title} className="rounded-xl border bg-white p-4 shadow-sm">
                                <p className="text-xl font-bold text-blue-800">{loading ? '—' : value}</p>
                                <p className="text-sm text-slate-600">{title}</p>
                            </div>
                        ))}
                    </div>
                    <section aria-labelledby="mapel-guru" className="space-y-3">
                        <h2 id="mapel-guru" className="text-lg font-bold text-slate-800">Mata Pelajaran Anda</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {subjects.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
                                <span className="rounded-full bg-blue-50 p-2.5 text-blue-700"><BookOpen size={20} /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="break-words font-semibold">{item.nama}</p>
                                    <p className="text-xs text-slate-500">{assignments.filter(pair => pair.mapel.id === item.id).length} kelas</p>
                                </div>
                                <button type="button" disabled={busy} className="shrink-0 rounded-lg border border-blue-200 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                    onClick={() => { setSubject(String(item.id)); setDraftSchedule(defaultSchedule()); setCreating(true); }}><Plus size={14} className="mr-1 inline" /> Buat Ujian</button>
                            </div>)}
                        </div>
                    </section>
                    {loading && <p role="status">Memuat ujian…</p>}
                    {!loading && !error && !assignments.length && <p className="text-sm text-slate-600">Belum ada penugasan mapel dan kelas. Hubungi admin untuk menambah penugasan.</p>}
                    {creating && (
                        <form key={subject} onSubmit={createExam} className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2">
                            <div className="flex items-center justify-between sm:col-span-2">
                                <h2 className="font-bold">Buat Draf Ujian</h2>
                                <button type="button" disabled={busy} className="text-sm text-slate-600" onClick={() => setCreating(false)}>Batal</button>
                            </div>
                            <label className="text-sm font-semibold">Judul ujian<input ref={draftTitle} name="judul" className={fieldClass} required maxLength={150} /></label>
                            <label className="text-sm font-semibold">Kelas tujuan
                                <select name="penugasan" className={fieldClass} required defaultValue="">
                                    <option value="">Pilih penugasan</option>
                                    {formPairs.map(({ mapel, kelas }) => (
                                        <option key={mapel.id + ':' + kelas.id} value={mapel.id + ':' + kelas.id}>{mapel.nama} · {kelas.namaKelas}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-sm font-semibold">Mulai<input name="mulai" type="datetime-local" defaultValue={draftSchedule.start} required className={fieldClass} /></label>
                            <label className="text-sm font-semibold">Selesai<input name="selesai" type="datetime-local" defaultValue={draftSchedule.end} required className={fieldClass} /></label>
                            <label className="text-sm font-semibold">Durasi (menit)<input name="durasi" type="number" min="1" step="1" defaultValue={defaultDuration} required className={fieldClass} /></label>
                            <button type="submit" disabled={busy} className={primaryClass + ' self-end justify-self-start'}>{busy ? 'Menyimpan…' : 'Simpan dan Preview'}</button>
                        </form>
                    )}
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                            <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList size={20} className="text-blue-700" /> Ujian Saya</h2>
                            <input aria-label="Cari ujian" type="search" placeholder="Cari ujian, mapel, atau kelas…" value={search}
                                onChange={event => setSearch(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm sm:w-64" />
                        </header>
                        {!loading && !error && !matches.length && <p className="p-6 text-sm text-slate-600">{exams.length ? 'Ujian tidak ditemukan.' : 'Belum ada ujian. Pilih mata pelajaran untuk membuat draf.'}</p>}
                        {!!matches.length && <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600"><tr>
                                    {['Judul ujian', 'Jadwal', 'Status', 'Aksi'].map(label => <th scope="col" key={label} className="px-4 py-3">{label}</th>)}
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {matches.map(item => {
                                        const now = Date.now();
                                        const status = item.draf ? 'Draf' : now < +new Date(item.waktuMulai) ? 'Terjadwal' : now >= +new Date(item.waktuSelesai) ? 'Selesai' : 'Berlangsung';
                                        return <tr key={item.id}>
                                            <td className="px-4 py-3"><strong>{item.judul}</strong><p className="mt-1 text-xs text-slate-600">{item.mapel.nama} · {item.kelas.namaKelas} · {item._count.soal} soal</p></td>
                                            <td className="whitespace-nowrap px-4 py-3 text-xs"><CalendarDays size={14} className="mr-1 inline text-slate-500" />{schedule.format(new Date(item.waktuMulai))}</td>
                                            <td className="px-4 py-3"><span className={'whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ' + (status === 'Draf' ? 'bg-amber-100 text-amber-900' : status === 'Berlangsung' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700')}>{status}</span></td>
                                            <td className="px-4 py-3"><button type="button" disabled={busy} onClick={() => void openExam(item.id)}
                                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50"><Eye size={15} /> Preview</button></td>
                                        </tr>;
                                    })}
                                </tbody>
                            </table>
                        </div>}
                    </section>
                </>
            )}
        </section>
    );
}

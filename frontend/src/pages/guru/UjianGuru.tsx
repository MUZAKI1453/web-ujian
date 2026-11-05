import { fieldClass, primaryClass } from '../../components/ui/styles';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, ClipboardList, Eye, FilePenLine, Laptop, Plus, Search, SquarePen } from 'lucide-react';
import { PortalHeader, PortalStat } from '../../components/PortalHeader';
import ClassPicker from '../../components/ClassPicker';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import ImportSoal from './ImportSoal';
import EditUjian from './EditUjian';
import QuestionContent from './QuestionContent';
import PublishExam, { specialPointTypes, type PointSettings } from './PublishExam';
import ExamSessions from './ExamSessions';
import ExamReport from './ExamReport';

interface Exam {
    id: number;
    judul: string;
    mapel: { nama: string };
    kelas: { namaKelas: string };
    kelasTujuan?: { id: number; namaKelas: string }[];
    durasiMenit: number;
    waktuMulai: string;
    waktuSelesai: string;
    draf: boolean;
}
type ExamRow = Exam & { _count: { soal: number } };
export type ExamDetail = Exam & { soal: Question[] };
export function examClassNames(exam: Exam) {
    return [...new Set([exam.kelas.namaKelas, ...(exam.kelasTujuan ?? []).map(item => item.namaKelas)])].join(', ');
}
type Assignment = { mapel: { id: number; nama: string }; kelas: { id: number; namaKelas: string } };

const questionGroups = [
    ['PG', 'Pilihan Ganda'], ['PM', 'Pilihan Majemuk'], ['BS', 'Benar / Salah'],
    ['ISIAN', 'Isian'], ['ESSAY', 'Essay']
] as const;
const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
type ExamTab = 'soal' | 'sesi' | 'rekap';
const defaultDuration = 120;
const examStatusStyles = {
    Draf: 'bg-amber-50 text-amber-800', Terjadwal: 'bg-slate-100 text-slate-600',
    Berlangsung: 'bg-blue-50 text-blue-700', Selesai: 'bg-emerald-50 text-emerald-700'
};
function examStatus(exam: Exam) {
    const now = Date.now();
    return exam.draf ? 'Draf' : now < +new Date(exam.waktuMulai) ? 'Terjadwal' : now >= +new Date(exam.waktuSelesai) ? 'Selesai' : 'Berlangsung';
}

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

export default function UjianGuru({ name, view = 'dashboard', onNavigate }: {
    name: string; view?: 'dashboard' | 'ujian' | 'mapel'; onNavigate: (page: string) => void;
}) {
    const [tab, setTab] = useState<ExamTab>('soal');
    const [subject, setSubject] = useState('');
    const [targetClasses, setTargetClasses] = useState<number[]>([]);
    const [search, setSearch] = useState('');
    const [exams, setExams] = useState<ExamRow[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [exam, setExam] = useState<ExamDetail | null>(null);
    const [editor, setEditor] = useState<{ focusId?: number } | null>(null);
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
        if (!targetClasses.length) { setError('Pilih minimal satu kelas tujuan ujian.'); return; }
        setBusy(true);
        setError('');
        const form = new FormData(event.currentTarget);
        const mapelId = Number(subject);
        try {
            const { data } = await api.post<ExamRow>('/guru/ujian', {
                judul: form.get('judul'), mapelId, kelasIds: targetClasses, durasiMenit: Number(form.get('durasi')),
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

    async function openExam(id: number, edit = false, nextTab: ExamTab = 'soal') {
        setBusy(true);
        setError('');
        try {
            const { data } = await api.get<ExamDetail>('/guru/ujian/' + id);
            setTab(nextTab);
            setPointSettings({});
            setExam(data);
            if (edit && data.draf) setEditor({});
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

    function updateQuestions(soal: Question[]) {
        if (!exam) return;
        setExam({ ...exam, soal });
        setExams(current => current.map(item => item.id === exam.id ? { ...item, _count: { soal: soal.length } } : item));
    }

    if (exam && editor) return <EditUjian exam={exam} focusId={editor.focusId}
        onCancel={() => setEditor(null)} onSave={updated => {
            setExam(updated);
            setExams(current => current.map(item => item.id === updated.id
                ? { ...updated, _count: { soal: updated.soal.length } } : item));
            setEditor(null);
            setNotice('Perubahan ujian berhasil disimpan.');
        }} />;

    if (exam && importing) return <ImportSoal examId={exam.id} onClose={() => setImporting(false)} onImport={questions => {
        updateQuestions([...exam.soal, ...questions]);
        setNotice(questions.length + ' soal berhasil diimpor.');
        setImporting(false);
    }} />;

    const subjects = [...new Map(assignments.map(pair => [pair.mapel.id, pair.mapel])).values()];
    const formPairs = assignments.filter(pair => !subject || String(pair.mapel.id) === subject);
    const matches = exams.filter(item => (item.judul + ' ' + item.mapel.nama + ' ' + examClassNames(item)).toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <section className="cbt-portal">
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {exam ? (
                <>
                    <button type="button" className="ui-button ui-button-secondary" onClick={() => { setExam(null); setNotice(''); }}><ArrowLeft size={16} /> Kembali</button>
                    <div className="ui-card flex flex-wrap items-start justify-between gap-3 border bg-white p-5">
                        <div>
                            <p className="text-sm font-semibold text-blue-700">Preview Ujian</p>
                            <h1 className="ui-page-title">{exam.judul}</h1>
                            <p className="text-sm text-slate-600">{exam.mapel.nama} · {examClassNames(exam)} · {exam.durasiMenit} menit · {exam.draf ? 'Draf' : 'Terbit'}</p>
                        </div>
                        {exam.draf && <div className="flex flex-wrap gap-2">
                            <button type="button" className="ui-button ui-button-secondary border"
                                onClick={() => { setNotice(''); setImporting(true); }}>Import</button>
                            <button type="button" className={primaryClass} onClick={() => setEditor({})}>Edit Ujian</button>
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
                    {tab === 'soal' && !exam.soal.length && <p className="text-sm text-slate-600">Belum ada soal. Pilih Edit Ujian untuk menambahkan soal.</p>}
                    {tab === 'soal' && [...questionGroups, ['lainnya', 'Soal Lainnya']].map(([type, label]) => {
                        const questions = exam.soal.map((question, index) => ({ question, index })).filter(({ question }) =>
                            type === 'lainnya' ? !questionGroups.some(([known]) => known === question.tipeSoal.toUpperCase()) : question.tipeSoal.toUpperCase() === type);
                        if (!questions.length) return null;
                        const special = specialPointTypes.find(item => item === type);
                        return <section key={type} className="ui-card overflow-hidden border bg-white">
                            <h2 className={'flex items-center justify-between px-4 py-3 font-semibold ' + (type === 'ESSAY' ? 'bg-amber-300 text-slate-900' : 'bg-blue-700 text-white')}>
                                {label}<span className="ui-badge bg-white/20">{questions.length} soal</span>
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
                                        className="ui-input w-24 border p-1" /> : <span>Poin dibagi rata dari sisa total.</span>}
                                </> : <span>{type === 'ESSAY' ? 'Atur poin maksimum pada masing-masing soal essay.' : 'Poin dibagi rata dari sisa total.'}</span>}
                            </div>}
                            <div className="divide-y divide-slate-200">{questions.map(({ question, index }) => (
                        <article key={question.id} className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-2">
                                <h2 className="flex flex-wrap items-center gap-2 font-semibold"><span className="grid min-h-8 min-w-8 place-items-center rounded-full bg-blue-700 px-1 text-sm text-white">{index + 1}</span> Soal{question.dibatalkan && <span className="ml-2 text-xs text-red-700">Dibatalkan</span>}</h2>
                                {exam.draf && <button type="button" className="ui-button ui-button-warning shrink-0 border"
                                    aria-label={'Edit Soal ' + (index + 1)} onClick={() => setEditor({ focusId: question.id })}>Edit Soal</button>}
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
                </>
            ) : (
                <>
                    {view === 'dashboard' ? <>
                        <PortalHeader name={name || 'Guru'} subtitle="Ringkasan ujian dan mata pelajaran Anda." icon={Laptop} />
                        <div className="grid gap-4 sm:grid-cols-3">
                            <PortalStat value={loading ? '—' : subjects.length} label="Mata Pelajaran" icon={BookOpen} />
                            <PortalStat value={loading ? '—' : exams.length} label="Ujian" icon={ClipboardList} />
                            <PortalStat value={loading ? '—' : exams.filter(item => item.draf).length} label="Draf" icon={FilePenLine} />
                        </div>
                        <section className="space-y-3" aria-labelledby="recent-exams-title">
                            <header className="flex flex-wrap items-center justify-between gap-3">
                                <h2 id="recent-exams-title" className="text-lg font-bold">Ujian terbaru</h2>
                                <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('guru-ujian')}>Lihat semua<ArrowRight size={16} aria-hidden="true" /></button>
                            </header>
                            <div className="grid gap-4 md:grid-cols-2">
                                {[...exams].sort((a, b) => b.id - a.id).slice(0, 4).map(item => {
                                    const status = examStatus(item);
                                    return <article key={item.id} className="ui-card flex min-w-0 flex-col gap-4 p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-blue-700">{item.mapel.nama}</span>
                                            <span className={'ui-badge ' + examStatusStyles[status]}>{status}</span>
                                        </div>
                                        <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{item.judul}</h3>
                                            <p className="mt-1 break-words text-sm text-slate-500">{examClassNames(item)} · {item._count.soal} soal</p>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                            <p className="text-xs text-slate-500">{schedule.format(new Date(item.waktuMulai))}</p>
                                            <button type="button" disabled={busy} className="ui-button ui-button-secondary" onClick={() => void openExam(item.id)}>Buka<ArrowRight size={16} aria-hidden="true" /></button>
                                        </div>
                                    </article>;
                                })}
                            </div>
                            {!loading && !exams.length && !error && <div className="ui-card space-y-3 p-8 text-center">
                                <ClipboardList size={32} className="mx-auto text-slate-300" aria-hidden="true" />
                                <p className="text-sm text-slate-500">Belum ada ujian.</p>
                                <button type="button" className={primaryClass} onClick={() => onNavigate('guru-mapel')}><Plus size={16} />Buat Ujian</button>
                            </div>}
                        </section>
                    </> : <header className="ui-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-8">
                        <h1 className="ui-page-title flex items-center gap-2.5">{view === 'ujian' ? <ClipboardList size={28} className="text-blue-600" aria-hidden="true" /> : <BookOpen size={28} className="text-blue-600" aria-hidden="true" />}{view === 'ujian' ? 'Ujian Saya' : 'Mata Pelajaran'}</h1>
                        {view === 'ujian' && <button type="button" className={primaryClass} onClick={() => onNavigate('guru-mapel')}><Plus size={18} />Buat Ujian</button>}
                    </header>}
                    {view === 'mapel' && <section aria-label="Mata pelajaran yang diampu" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {subjects.map(item => <article key={item.id} className="ui-card flex min-w-0 flex-col gap-4 p-5">
                            <div className="flex items-start gap-3">
                                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><BookOpen size={22} aria-hidden="true" /></span>
                                <div className="min-w-0"><h2 className="break-words font-semibold">{item.nama}</h2>
                                    <p className="mt-1 break-words text-sm text-slate-500">{assignments.filter(pair => pair.mapel.id === item.id).map(pair => pair.kelas.namaKelas).join(', ')}</p>
                                </div>
                            </div>
                            <button type="button" disabled={busy} className="ui-button ui-button-secondary mt-auto w-full"
                                onClick={() => { setSubject(String(item.id)); setTargetClasses([]); setDraftSchedule(defaultSchedule()); setCreating(true); }}><Plus size={16} aria-hidden="true" />Buat Ujian</button>
                        </article>)}
                    </section>}
                    {loading && <p role="status">Memuat ujian…</p>}
                    {!loading && !error && !assignments.length && <p className="text-sm text-slate-600">Belum ada penugasan mapel dan kelas. Hubungi admin untuk menambah penugasan.</p>}
                    {creating && (
                        <form key={subject} onSubmit={createExam} className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2">
                            <div className="flex items-center justify-between sm:col-span-2">
                                <h2 className="font-bold">Buat Draf Ujian</h2>
                                <button type="button" disabled={busy} className="text-sm text-slate-600" onClick={() => setCreating(false)}>Batal</button>
                            </div>
                            <label className="ui-label">Judul ujian<input ref={draftTitle} name="judul" className={fieldClass} required maxLength={150} /></label>
                            <div className="self-center text-sm text-slate-600">Mata pelajaran: <strong>{subjects.find(item => String(item.id) === subject)?.nama}</strong></div>
                            <div className="sm:col-span-2"><ClassPicker classes={formPairs.map(pair => pair.kelas)} selected={targetClasses} onChange={setTargetClasses} disabled={busy} />
                                <p className="mt-2 text-xs text-slate-500">Pilih satu atau beberapa kelas. Semua kelas menggunakan soal dan jadwal ujian yang sama.</p>
                            </div>
                            <label className="ui-label">Mulai<input name="mulai" type="datetime-local" defaultValue={draftSchedule.start} required className={fieldClass} /></label>
                            <label className="ui-label">Selesai<input name="selesai" type="datetime-local" defaultValue={draftSchedule.end} required className={fieldClass} /></label>
                            <label className="ui-label">Durasi (menit)<input name="durasi" type="number" min="1" step="1" defaultValue={defaultDuration} required className={fieldClass} /></label>
                            <button type="submit" disabled={busy} className={primaryClass + ' self-end justify-self-start'}>{busy ? 'Menyimpan…' : 'Simpan dan Preview'}</button>
                        </form>
                    )}
                    {view === 'ujian' && <section className="ui-card overflow-hidden border bg-white">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                            <h2 className="text-lg font-bold">Daftar ujian</h2>
                            <div className="relative w-full sm:w-80"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Cari ujian" type="search" placeholder="Cari ujian, mapel, atau kelas…" value={search}
                                onChange={event => setSearch(event.target.value)} className="ui-input w-full pl-10" /></div>
                        </header>
                        {!loading && !error && !matches.length && <p className="p-6 text-sm text-slate-600">{exams.length ? 'Ujian tidak ditemukan.' : 'Belum ada ujian. Pilih mata pelajaran untuk membuat draf.'}</p>}
                        {!!matches.length && <div className="overflow-x-auto">
                            <table className="cbt-table w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600"><tr>
                                    {['Judul ujian', 'Jadwal', 'Status', 'Aksi'].map(label => <th scope="col" key={label} className="px-4 py-3">{label}</th>)}
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {matches.map(item => {
                                        const status = examStatus(item);
                                        return <tr key={item.id}>
                                            <td className="px-4 py-3"><strong>{item.judul}</strong><p className="mt-1 text-xs text-slate-600">{item.mapel.nama} · {examClassNames(item)} · {item._count.soal} soal</p></td>
                                            <td className="whitespace-nowrap px-4 py-3 text-xs"><CalendarDays size={14} className="mr-1 inline text-slate-500" />{schedule.format(new Date(item.waktuMulai))}</td>
                                            <td className="px-4 py-3"><span className={'ui-badge whitespace-nowrap ' + examStatusStyles[status]}>{status}</span></td>
                                            <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                                                <button type="button" disabled={busy} onClick={() => void openExam(item.id)}
                                                    className="ui-button ui-button-secondary inline-flex items-center gap-1.5 whitespace-nowrap border"><Eye size={15} /> Preview</button>
                                                {item.draf && <button type="button" disabled={busy} onClick={() => void openExam(item.id, true)}
                                                    className="ui-button ui-button-soft"><SquarePen size={15} /> Edit Soal</button>}
                                                {!item.draf && <button type="button" disabled={busy} onClick={() => void openExam(item.id, false, 'rekap')}
                                                    className="ui-button ui-button-secondary"><BarChart3 size={15} /> Lihat Nilai</button>}
                                            </div></td>
                                        </tr>;
                                    })}
                                </tbody>
                            </table>
                        </div>}
                    </section>}
                </>
            )}
        </section>
    );
}

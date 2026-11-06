import { primaryClass } from '../../components/ui/styles';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, Check, CheckCheck, CircleDot, ClipboardList, Clock3, Eye, FilePenLine, GraduationCap, Laptop, ListChecks, Plus, Search, SquarePen, TextCursorInput, UploadCloud, Users, X, type LucideIcon } from 'lucide-react';
import { PortalHeader, PortalStat } from '../../components/PortalHeader';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import { questionTypeLabels } from './questionTypes';
import ImportSoal from './ImportSoal';
import EditUjian from './EditUjian';
import QuestionContent from './QuestionContent';
import PublishExam, { type PointSettings } from './PublishExam';
import ExamSessions from './ExamSessions';
import ExamReport from './ExamReport';
import DraftExamForm from './DraftExamForm';
import { examOnDate } from './examDateFilter';

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
export type ExamRow = Exam & { _count: { soal: number } };
export type ExamDetail = Exam & { soal: Question[] };
export function examClassNames(exam: Exam) {
    return [...new Set([exam.kelas.namaKelas, ...(exam.kelasTujuan ?? []).map(item => item.namaKelas)])].join(', ');
}

function ExamMetadata({ exam }: { exam: Exam }) {
    return <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        <div className="flex min-w-0 items-center gap-1.5"><BookOpen size={15} className="shrink-0 text-slate-400" aria-hidden="true" /><dt className="sr-only">Mata pelajaran</dt><dd className="break-words">{exam.mapel.nama}</dd></div>
        <div className="flex min-w-0 items-center gap-1.5"><GraduationCap size={16} className="shrink-0 text-slate-400" aria-hidden="true" /><dt className="sr-only">Kelas</dt><dd className="break-words">{examClassNames(exam)}</dd></div>
        <div className="flex items-center gap-1.5"><Clock3 size={15} className="text-slate-400" aria-hidden="true" /><dt className="sr-only">Durasi</dt><dd>{exam.durasiMenit} menit</dd></div>
    </dl>;
}

function ExamListMetadata({ exam }: { exam: ExamRow }) {
    return <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-blue-700"><BookOpen size={13} className="shrink-0" aria-hidden="true" />{exam.mapel.nama}</span>
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-violet-700"><GraduationCap size={14} className="shrink-0" aria-hidden="true" />{examClassNames(exam)}</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-800"><ClipboardList size={13} aria-hidden="true" />{exam._count.soal} soal</span>
    </div>;
}

const examActionStyles = {
    preview: 'ui-button border border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700',
    sessions: 'ui-button border border-violet-600 bg-violet-600 text-white hover:border-violet-700 hover:bg-violet-700',
    report: 'ui-button border border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700'
};

function ExamActions({ exam, busy, onOpen }: { exam: Exam; busy: boolean; onOpen: (id: number, edit?: boolean, view?: DetailView) => void }) {
    return <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={examActionStyles.preview} onClick={() => onOpen(exam.id)}><Eye size={16} aria-hidden="true" />Preview</button>
        {exam.draf ? <button type="button" disabled={busy} className="ui-button border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" onClick={() => onOpen(exam.id, true)}><SquarePen size={16} aria-hidden="true" />Edit Soal</button> : <>
            <button type="button" disabled={busy} className={examActionStyles.sessions} onClick={() => onOpen(exam.id, false, 'sessions')}><Users size={16} aria-hidden="true" />Sesi & Peserta</button>
            <button type="button" disabled={busy} className={examActionStyles.report} onClick={() => onOpen(exam.id, false, 'report')}><BarChart3 size={16} aria-hidden="true" />Koreksi & Rekap</button>
        </>}
    </div>;
}
type Assignment = { mapel: { id: number; nama: string }; kelas: { id: number; namaKelas: string } };

const questionGroups = Object.entries(questionTypeLabels);
const questionGroupStyles: Record<string, { header: string; icon: LucideIcon }> = {
    PG: { header: 'border-blue-600 bg-blue-600 text-white', icon: CircleDot },
    PM: { header: 'border-indigo-600 bg-indigo-600 text-white', icon: ListChecks },
    BS: { header: 'border-teal-600 bg-teal-600 text-white', icon: CheckCheck },
    ISIAN: { header: 'border-cyan-700 bg-cyan-700 text-white', icon: TextCursorInput },
    ESSAY: { header: 'border-amber-400 bg-amber-400 text-amber-950', icon: FilePenLine }
};
const backButtonClass = 'ui-button border border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-200 hover:bg-blue-100';
const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
type DetailView = 'preview' | 'sessions' | 'report';
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

export default function UjianGuru({ name, view = 'dashboard', onNavigate }: {
    name: string; view?: 'dashboard' | 'ujian' | 'mapel'; onNavigate: (page: string) => void;
}) {
    const [detailView, setDetailView] = useState<DetailView>('preview');
    const [search, setSearch] = useState('');
    const [examDate, setExamDate] = useState('');
    const [exams, setExams] = useState<ExamRow[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [exam, setExam] = useState<ExamDetail | null>(null);
    const [editor, setEditor] = useState<{ focusId?: number } | null>(null);
    const [pointSettings, setPointSettings] = useState<PointSettings>({});
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

    async function openExam(id: number, edit = false, nextView: DetailView = 'preview') {
        setBusy(true);
        setError('');
        try {
            const { data } = await api.get<ExamDetail>('/guru/ujian/' + id);
            setDetailView(nextView);
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

    function backToExams() {
        setExam(null); setDetailView('preview'); setNotice(''); setError('');
    }

    if (exam && editor) return <EditUjian exam={exam} focusId={editor.focusId}
        onCancel={() => setEditor(null)} onSave={updated => {
            setExam(updated);
            setExams(current => current.map(item => item.id === updated.id
                ? { ...updated, _count: { soal: updated.soal.length } } : item));
            setEditor(null);
            setNotice('Perubahan ujian berhasil disimpan.');
        }} />;

    if (exam && !exam.draf && detailView !== 'preview') {
        const detailHeader = (action?: ReactNode) => <header className="ui-card flex flex-wrap items-center justify-between gap-4 bg-white p-5">
            <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">{detailView === 'sessions' ? <><Users size={17} aria-hidden="true" />Sesi & Peserta</> : <><BarChart3 size={17} aria-hidden="true" />Koreksi & Rekap</>}</p>
            <h1 className="ui-page-title break-words">{exam.judul}</h1>
            <ExamMetadata exam={exam} />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">{action}<button type="button" className={backButtonClass} onClick={backToExams}><ArrowLeft size={17} aria-hidden="true" />Kembali</button></div>
        </header>;
        return <section className="cbt-portal">{detailView === 'sessions' ? <ExamSessions key={exam.id} examId={exam.id} renderHeader={detailHeader} /> : <ExamReport key={exam.id} examId={exam.id} questions={exam.soal} onQuestionsChanged={refreshQuestions} renderHeader={detailHeader} />}</section>;
    }

    const subjects = [...new Map(assignments.map(pair => [pair.mapel.id, pair.mapel])).values()];
    const matches = exams.filter(item => (item.judul + ' ' + item.mapel.nama + ' ' + examClassNames(item)).toLowerCase().includes(search.trim().toLowerCase()) && examOnDate(item.waktuMulai, examDate));

    return (
        <section className="cbt-portal">
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {exam ? (
                <>
                    {importing && <ImportSoal examId={exam.id} onClose={() => setImporting(false)} onImport={questions => {
                        updateQuestions([...exam.soal, ...questions]);
                        setNotice(questions.length + ' soal berhasil diimpor.');
                        setImporting(false);
                    }} />}
                    <div className="ui-card flex flex-wrap items-center justify-between gap-4 border bg-white p-5">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-blue-700">Pratinjau Ujian</p>
                            <h1 className="ui-page-title break-words">{exam.judul}</h1>
                            <ExamMetadata exam={exam} />
                        </div>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            {exam.draf && <>
                            <button type="button" className="ui-button ui-button-success"
                                onClick={() => { setNotice(''); setImporting(true); }}><UploadCloud size={18} aria-hidden="true" />Import</button>
                            <button type="button" className={primaryClass} onClick={() => setEditor({})}><SquarePen size={18} aria-hidden="true" />Edit Ujian</button>
                            </>}
                            <button type="button" className={backButtonClass} onClick={backToExams}><ArrowLeft size={17} aria-hidden="true" />Kembali</button>
                        </div>
                    </div>
                    {exam.draf && <PublishExam key={JSON.stringify([exam.id, exam.soal.map(q => [q.id, q.bobot, q.tipeSoal])])}
                        examId={exam.id} settings={pointSettings} questions={exam.soal} onSettingsChange={setPointSettings} onPublish={updated => {
                            setExam({ ...exam, draf: false, soal: updated });
                            setExams(current => current.map(item => item.id === exam.id ? { ...item, draf: false } : item));
                            setNotice('Ujian berhasil diterbitkan.');
                        }} />}
                    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
                    {!exam.soal.length && <p className="text-sm text-slate-600">Belum ada soal. Pilih Edit Ujian untuk menambahkan soal.</p>}
                    {[...questionGroups, ['lainnya', 'Soal Lainnya']].map(([type, label]) => {
                        const questions = exam.soal.map((question, index) => ({ question, index })).filter(({ question }) =>
                            type === 'lainnya' ? !questionGroups.some(([known]) => known === question.tipeSoal.toUpperCase()) : question.tipeSoal.toUpperCase() === type);
                        if (!questions.length) return null;
                        const groupStyle = questionGroupStyles[type] ?? { header: 'border-slate-600 bg-slate-600 text-white', icon: ClipboardList };
                        const GroupIcon = groupStyle.icon;
                        return <section key={type} className="ui-card overflow-hidden border bg-white">
                            <div className={'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ' + groupStyle.header}>
                                <h2 className="flex items-center gap-3 font-semibold"><span className="grid size-9 place-items-center rounded-lg bg-white/20"><GroupIcon size={20} aria-hidden="true" /></span>{label}</h2>
                            </div>
                            <div className="divide-y divide-slate-200">{questions.map(({ question, index }) => (
                        <article key={question.id} className="p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600"><span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs"><ClipboardList size={14} aria-hidden="true" />Nomor {String(index + 1).padStart(2, '0')}</span>{question.dibatalkan && <span className="text-xs text-red-700">Dibatalkan</span>}</h3>
                                {(!exam.draf || type === 'ESSAY') && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{Number(question.bobot)} poin</span>}
                            </div>
                            <div className={type === 'ESSAY' ? 'mt-4 max-w-3xl whitespace-pre-wrap break-words rounded-xl border border-amber-100 bg-amber-50/40 px-4 py-4 text-base leading-8 sm:px-5' : 'mt-3 whitespace-pre-wrap break-words text-base leading-relaxed'}><QuestionContent text={question.pertanyaan} image={question.isi?.gambar} /></div>
                            {!!question.isi?.items?.length && <ol className="mt-3 space-y-1">
                                {question.isi.items.map((item, i) => (
                                    <li key={i} className={'flex items-start gap-2 rounded-lg px-3 py-2 text-sm ' +
                                        (item.benar ? 'bg-emerald-50 text-emerald-900' : type === 'BS' ? 'bg-red-50 text-red-900' : 'bg-slate-50')}>
                                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white font-semibold" role={type === 'BS' ? 'img' : undefined} aria-label={type === 'BS' ? item.benar ? 'Benar' : 'Salah' : undefined} title={type === 'BS' ? item.benar ? 'Benar' : 'Salah' : undefined}>
                                            {type === 'BS' ? item.benar ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" /> : optionLabel(i)}
                                        </span>
                                        <div className="min-w-0 flex-1 break-words"><QuestionContent text={item.teks} image={item.gambar} /></div>
                                        {type !== 'BS' && item.benar && <span className="shrink-0" role="img" aria-label="Jawaban benar" title="Jawaban benar">
                                            <Check size={18} aria-hidden="true" />
                                        </span>}
                                    </li>
                                ))}
                            </ol>}
                            {type === 'ISIAN' && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                                <p className="font-semibold">Kunci jawaban</p>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {question.isi?.jawaban?.map((answer, i) => <li key={i} className="max-w-full whitespace-pre-wrap break-words rounded-lg border border-emerald-200 bg-white px-3 py-1.5">{answer}</li>)}
                                </ul>
                            </div>}
                        </article>
                            ))}</div>
                        </section>;
                    })}
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
                                            <span className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays size={14} aria-hidden="true" />{schedule.format(new Date(item.waktuMulai))}</span>
                                            <span className={'ui-badge ' + examStatusStyles[status]}>{status}</span>
                                        </div>
                                        <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{item.judul}</h3>
                                            <ExamListMetadata exam={item} />
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                            <ExamActions exam={item} busy={busy} onOpen={openExam} />
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
                        <h1 className="ui-page-title flex items-center gap-2.5">{view === 'ujian' ? <ClipboardList size={28} className="text-blue-600" aria-hidden="true" /> : <FilePenLine size={28} className="text-blue-600" aria-hidden="true" />}{view === 'ujian' ? 'Ujian Saya' : 'Buat Draf Ujian'}</h1>
                        {view === 'ujian' && <button type="button" className={primaryClass} onClick={() => onNavigate('guru-mapel')}><Plus size={18} />Buat Draf Ujian</button>}
                    </header>}
                    {view === 'mapel' && !loading && assignments.length > 0 && <DraftExamForm assignments={assignments} onCreated={created => {
                        setExams(current => [created, ...current]); setDetailView('preview'); setPointSettings({}); setExam({ ...created, soal: [] });
                    }} />}
                    {loading && <p role="status">Memuat ujian…</p>}
                    {!loading && !error && !assignments.length && <p className="text-sm text-slate-600">Belum ada penugasan mapel dan kelas. Hubungi admin untuk menambah penugasan.</p>}
                    {view === 'ujian' && <section className="ui-card overflow-hidden border bg-white">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                            <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList size={21} className="text-blue-600" aria-hidden="true" />Daftar ujian</h2>
                            <div className="ml-auto flex w-full flex-wrap items-center gap-2 xl:w-auto">
                            <div className="relative w-full sm:w-72"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Cari ujian" type="search" placeholder="Cari ujian, mapel, atau kelas…" value={search}
                                onChange={event => setSearch(event.target.value)} className="ui-input w-full pl-10" /></div>
                            <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3">
                                <CalendarDays size={17} className="text-blue-600" aria-hidden="true" /><span className="sr-only">Tanggal mulai ujian</span>
                                <input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} className="min-h-10 min-w-0 border-0 bg-transparent text-sm text-blue-900" />
                            </label>
                            {examDate && <button type="button" title="Hapus filter tanggal" aria-label="Hapus filter tanggal" className="grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100" onClick={() => setExamDate('')}><X size={17} aria-hidden="true" /></button>}
                            </div>
                        </header>
                        {!loading && !error && !matches.length && <p className="p-6 text-sm text-slate-600">{exams.length ? 'Ujian tidak ditemukan.' : 'Belum ada ujian. Pilih mata pelajaran untuk membuat draf.'}</p>}
                        {!!matches.length && <div className="overflow-x-auto">
                            <table className="ui-table w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600"><tr className="divide-x divide-slate-200">
                                    {['Judul ujian', 'Jadwal', 'Status', 'Aksi'].map(label => <th scope="col" key={label} className="px-4 py-3">{label}</th>)}
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {matches.map(item => {
                                        const status = examStatus(item);
                                        return <tr key={item.id} className="divide-x divide-slate-200">
                                            <td className="px-4 py-3"><strong>{item.judul}</strong><ExamListMetadata exam={item} /></td>
                                            <td className="whitespace-nowrap px-4 py-3 text-xs"><CalendarDays size={14} className="mr-1 inline text-slate-500" />{schedule.format(new Date(item.waktuMulai))}</td>
                                            <td className="px-4 py-3"><span className={'ui-badge whitespace-nowrap ' + examStatusStyles[status]}>{status}</span></td>
                                            <td className="px-4 py-3"><ExamActions exam={item} busy={busy} onOpen={openExam} /></td>
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

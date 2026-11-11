import { primaryClass } from '../../components/ui/styles';
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, ClipboardList, Clock3, Copy, Eye, FilePenLine, GraduationCap, Laptop, Plus, Search, SquarePen, Trash2, UploadCloud, Users, X } from 'lucide-react';
import { PortalHeader, PortalStat } from '../../components/PortalHeader';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { backLayer, useBackHandler } from '../../components/ui/useBackHandler';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import ImportSoal from './ImportSoal';
import EditUjian from './EditUjian';
import ExamQuestionReview, { ExamReviewHeader } from '../../components/ExamQuestionReview';
import PublishExam, { specialPointTypes, type PointSettings } from './PublishExam';
import ExamSessions from './ExamSessions';
import ExamReport from './ExamReport';
import DraftExamForm from './DraftExamForm';
import { examOnDate } from './examDateFilter';
import ExamTypeBadge from '../../components/ExamTypeBadge';
import type { ExamProfile } from './examProfiles';
import { useConfirmation } from '../../components/ConfirmationProvider';

interface Exam {
    id: number;
    judul: string;
    jenisUjianId: number | null;
    ujianAsalId: number | null;
    profil: ExamProfile;
    mapel: { id: number; nama: string };
    kelas: { namaKelas: string };
    kelasTujuan?: { id: number; namaKelas: string }[];
    durasiMenit: number;
    waktuMulai: string;
    waktuSelesai: string;
    draf: boolean;
    hasilRilis: boolean;
    acakSoal?: boolean;
    acakOpsi?: boolean;
    bahasanRilis: boolean;
    diarsipkanPada: string | null;
    poinKhusus?: Partial<Record<keyof PointSettings, number>> | null;
}
export type ExamType = { id: number; nama: string };
export type ExamRow = Exam & { _count: { soal: number } };
export type ExamDetail = Exam & { soal: Question[] };
export function examClassNames(exam: Exam) {
    return [...new Set([exam.kelas.namaKelas, ...(exam.kelasTujuan ?? []).map(item => item.namaKelas)])].join(', ');
}

function ExamMetadata({ exam }: { exam: Exam }) {
    return <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        <div className="min-w-0"><dt className="sr-only">Jenis ujian</dt><dd><ExamTypeBadge label={exam.judul} /></dd></div>
        <div className="flex min-w-0 items-center gap-1.5"><GraduationCap size={16} className="shrink-0 text-slate-400" aria-hidden="true" /><dt className="sr-only">Kelas</dt><dd className="break-words">{examClassNames(exam)}</dd></div>
        <div className="flex items-center gap-1.5"><Clock3 size={15} className="text-slate-400" aria-hidden="true" /><dt className="sr-only">Durasi</dt><dd>{exam.durasiMenit} menit</dd></div>
    </dl>;
}

function ExamListMetadata({ exam }: { exam: ExamRow }) {
    return <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
        <ExamTypeBadge label={exam.judul} />
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-blue-700"><GraduationCap size={14} className="shrink-0" aria-hidden="true" />{examClassNames(exam)}</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-slate-800"><ClipboardList size={13} aria-hidden="true" />{exam._count.soal} soal</span>
    </div>;
}

function ExamActions({ exam, busy, onOpen }: { exam: Exam; busy: boolean; onOpen: (id: number, edit?: boolean, view?: DetailView) => void }) {
    return <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="ui-button ui-button-neutral-soft" onClick={() => onOpen(exam.id)}><Eye size={16} aria-hidden="true" />Preview</button>
        {exam.draf ? <button type="button" disabled={busy} className="ui-button ui-button-edit" onClick={() => onOpen(exam.id, true)}><SquarePen size={16} aria-hidden="true" />Edit Soal</button> : <>
            <button type="button" disabled={busy} className="ui-button ui-button-soft" onClick={() => onOpen(exam.id, false, 'sessions')}><Users size={16} aria-hidden="true" />Sesi & Peserta</button>
            <button type="button" disabled={busy} className="ui-button ui-button-success-soft" onClick={() => onOpen(exam.id, false, 'report')}><BarChart3 size={16} aria-hidden="true" />Koreksi &amp; Rekap</button>
        </>}
    </div>;
}
type Assignment = { mapel: { id: number; nama: string }; kelas: { id: number; namaKelas: string } };

function savedPointSettings(exam: Exam): PointSettings {
    const settings: PointSettings = {};
    for (const type of specialPointTypes) {
        const points = exam.poinKhusus?.[type];
        if (typeof points === 'number' && points > 0 && points <= 100) settings[type] = String(points);
    }
    return settings;
}

const backButtonClass = 'ui-button border border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-200 hover:bg-blue-100';
const schedule = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
type DetailView = 'preview' | 'sessions' | 'report';
const examStatusStyles = {
    Draf: 'bg-yellow-100 text-yellow-900', Terjadwal: 'bg-slate-100 text-slate-600',
    Berlangsung: 'bg-blue-50 text-blue-700', Selesai: 'bg-green-50 text-green-700',
    Diarsipkan: 'bg-slate-100 text-slate-600'
};
function examStatus(exam: Exam) {
    const now = Date.now();
    if (exam.diarsipkanPada) return 'Diarsipkan';
    return exam.draf ? 'Draf' : now < +new Date(exam.waktuMulai) ? 'Terjadwal' : now >= +new Date(exam.waktuSelesai) ? 'Selesai' : 'Berlangsung';
}

export default function UjianGuru({ view = 'dashboard', onNavigate }: {
    view?: 'dashboard' | 'ujian' | 'mapel'; onNavigate: (page: string) => void;
}) {
    const askConfirmation = useConfirmation();
    const [archiveView, setArchiveView] = useState(false);
    const [detailView, setDetailView] = useState<DetailView>('preview');
    const [search, setSearch] = useState('');
    const [examDate, setExamDate] = useState('');
    const [exams, setExams] = useState<ExamRow[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [examTypes, setExamTypes] = useState<ExamType[]>([]);
    const [exam, setExam] = useState<ExamDetail | null>(null);
    const [editor, setEditor] = useState<{ focusId?: number } | null>(null);
    const [pointSettings, setPointSettings] = useState<PointSettings>({});
    const [importing, setImporting] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {

        const controller = new AbortController();
        api.get<{ ujian: ExamRow[]; penugasan: Assignment[]; jenisUjian: ExamType[] }>('/guru/ujian', { signal: controller.signal })
            .then(({ data }) => {
                setExams(data.ujian);
                setAssignments(data.penugasan);
                setExamTypes(data.jenisUjian);
            })
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    async function openExam(id: number, edit = false, nextView: DetailView = 'preview') {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const { data } = await api.get<ExamDetail>('/guru/ujian/' + id);
            setExams(current => current.some(item => item.id === data.id) ? current : [{ ...data, _count: { soal: data.soal.length } }, ...current]);
            setDetailView(nextView);
            setPointSettings(savedPointSettings(data));
            setExam(data);
            if (edit && data.draf) setEditor({});
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function manageExam(item: Exam) {
        const archive = !item.diarsipkanPada;
        const label = item.mapel.nama + ' · ' + item.judul;
        if (item.draf || archive) {
            const confirmed = await askConfirmation(item.draf ? {
                title: 'Hapus draf ujian?',
                message: label + '. Draf dan semua soalnya akan dihapus permanen.',
                confirmLabel: 'Hapus Draf',
                tone: 'danger'
            } : {
                title: 'Arsipkan ujian?',
                message: label + '. Ujian dipindahkan ke arsip. Nilai dan pembahasan tetap tersedia sesuai pengaturan rilis.',
                confirmLabel: 'Arsipkan',
                tone: 'info'
            });
            if (!confirmed) return;
        }
        setBusy(true);
        setError('');
        setNotice('');
        try {
            if (item.draf) {
                await api.delete('/guru/ujian/' + item.id);
                setExams(current => current.filter(exam => exam.id !== item.id));
                setNotice('Draf ujian dihapus.');
            } else {
                const { data } = await api.patch<{ diarsipkanPada: string | null }>('/guru/ujian/' + item.id + '/arsip', { arsip: archive });
                setExams(current => current.map(exam => exam.id === item.id ? { ...exam, ...data } : exam));
                if (archive) {
                    setExam(null);
                    setDetailView('preview');
                }
                setNotice(archive ? 'Ujian dipindahkan ke arsip.' : 'Ujian dikembalikan ke daftar utama.');
            }
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
        if (view === 'mapel') {
            onNavigate('guru-ujian');
            return;
        }
        setExam(null); setDetailView('preview'); setNotice(''); setError('');
        if (detailView === 'sessions') {
            setLoading(true);
            api.get<{ ujian: ExamRow[] }>('/guru/ujian')
                .then(({ data }) => setExams(data.ujian))
                .catch(err => setError(errorMessage(err)))
                .finally(() => setLoading(false));
        }
    }

    useBackHandler(!!exam, () => { if (!busy) backToExams(); }, backLayer.detail);
    useBackHandler(!!editor, () => setEditor(null), backLayer.editor);
    useBackHandler(duplicating, () => setDuplicating(false), backLayer.editor);

    if (exam && duplicating) return <section className="cbt-portal">
        <header className="ui-card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
                <h1 className="ui-page-title">Duplikat ke Draf</h1>
                <p className="mt-1 text-sm text-slate-600">{exam.mapel.nama} · {exam.judul}</p>
            </div>
            <button type="button" className={backButtonClass} onClick={() => setDuplicating(false)}><ArrowLeft size={17} aria-hidden="true" />Kembali</button>
        </header>
        <DraftExamForm source={exam} assignments={assignments.filter(pair => pair.mapel.id === exam.mapel.id)} examTypes={examTypes} onCreated={created => {
            setExams(current => [created, ...current]);
            setExam({ ...created, soal: created.soal ?? [] });
            setPointSettings(savedPointSettings(created));
            setDuplicating(false);
            setArchiveView(false);
            setSearch('');
            setExamDate('');
            setNotice('Salinan draf siap diperiksa.');
        }} />
    </section>;

    if (exam && editor) return <EditUjian exam={exam} examTypes={examTypes} focusId={editor.focusId}
        onCancel={() => setEditor(null)} onSave={updated => {
            setExam(updated);
            setExams(current => current.map(item => item.id === updated.id
                ? { ...updated, _count: { soal: updated.soal.length } } : item));
            setEditor(null);
            setNotice('Perubahan ujian berhasil disimpan.');
        }} />;

    if (exam && !exam.draf && detailView !== 'preview') {
        const detailHeader = (action?: ReactNode) => <header className="ui-card flex flex-col gap-4 bg-white p-5 xl:flex-row xl:flex-wrap xl:items-center">
            <div className="min-w-0 space-y-1 xl:flex-[1_1_20rem]">
            <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">{detailView === 'sessions' ? <><Users size={17} aria-hidden="true" />Sesi & Peserta</> : <><BarChart3 size={17} aria-hidden="true" />Koreksi & Rekap</>}</p>
            <h1 className="ui-page-title break-words">{exam.mapel.nama}</h1>
            <ExamMetadata exam={exam} />
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:ml-auto">{action}<button type="button" disabled={busy} className={backButtonClass} onClick={backToExams}><ArrowLeft size={17} aria-hidden="true" />Kembali</button></div>
        </header>;
        return <section className="cbt-portal">
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {detailView === 'sessions'
                ? <ExamSessions key={exam.id} examId={exam.id} archived={Boolean(exam.diarsipkanPada)} archiving={busy} onArchive={() => manageExam(exam)} renderHeader={detailHeader} />
                : <ExamReport key={exam.id} examId={exam.id} questions={exam.soal} onQuestionsChanged={refreshQuestions} renderHeader={detailHeader}
                    onOpenRemedial={id => { setArchiveView(false); setSearch(''); setExamDate(''); return openExam(id); }} />}
        </section>;
    }

    const subjects = [...new Map(assignments.map(pair => [pair.mapel.id, pair.mapel])).values()];
    const activeExams = exams.filter(item => !item.diarsipkanPada);
    const listedExams = archiveView ? exams.filter(item => item.diarsipkanPada) : activeExams;
    const matches = listedExams.filter(item => (item.judul + ' ' + item.mapel.nama + ' ' + examClassNames(item)).toLowerCase().includes(search.trim().toLowerCase()) && examOnDate(item.waktuMulai, examDate));

    return (
        <section className="cbt-portal">
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {!exam && notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
            {exam ? (
                <>
                    {importing && <ImportSoal examId={exam.id} onClose={() => setImporting(false)} onImport={questions => {
                        updateQuestions([...exam.soal, ...questions]);
                        setNotice(questions.length + ' soal berhasil diimpor.');
                        setImporting(false);
                    }} />}
                    <ExamReviewHeader label="Preview Ujian" title={exam.mapel.nama} metadata={<ExamMetadata exam={exam} />} actions={<>
                        {assignments.some(pair => pair.mapel.id === exam.mapel.id) && <button type="button" className="ui-button ui-button-neutral-soft" onClick={() => setDuplicating(true)}><Copy size={17} aria-hidden="true" />Duplikat ke Draf</button>}
                        {exam.draf && <>
                            <button type="button" className="ui-button ui-button-success"
                                onClick={() => { setNotice(''); setImporting(true); }}><UploadCloud size={18} aria-hidden="true" />Import</button>
                            <button type="button" className="ui-button ui-button-edit" onClick={() => setEditor({})}><SquarePen size={18} aria-hidden="true" />Edit Ujian</button>
                        </>}
                        <button type="button" className={backButtonClass} onClick={backToExams}><ArrowLeft size={17} aria-hidden="true" />Kembali</button>
                    </>} />
                    {exam.draf && <PublishExam key={JSON.stringify([exam.id, exam.soal.map(q => [q.id, q.bobot, q.tipeSoal])])}
                        examId={exam.id} settings={pointSettings} questions={exam.soal} onSettingsChange={setPointSettings} onPublish={updated => {
                            setExam({ ...exam, draf: false, soal: updated });
                            setExams(current => current.map(item => item.id === exam.id ? { ...item, draf: false } : item));
                            setNotice('Ujian berhasil diterbitkan.');
                        }} />}
                    {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}
                    {!exam.soal.length && <p className="text-sm text-slate-600">Belum ada soal. Pilih Edit Ujian untuk menambahkan soal.</p>}
                    {exam.soal.length > 0 && <ExamQuestionReview questions={exam.soal} points={question =>
                        !exam.draf || question.tipeSoal.toUpperCase() === 'ESSAY'
                            ? Number(question.bobot).toLocaleString('id-ID', { maximumFractionDigits: 4 }) + ' poin' : undefined} />}
                </>
            ) : (
                <>
                    {view === 'dashboard' ? <>
                        <PortalHeader title="Ruang Mengajar" label="Persiapan & evaluasi" subtitle="Siapkan soal, atur pelaksanaan, dan ikuti perkembangan ujian." icon={Laptop}>
                            <button type="button" className={primaryClass} onClick={() => onNavigate('guru-mapel')}><Plus size={17} aria-hidden="true" />Buat Ujian</button>
                            <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('guru-ujian')}>Lihat Ujian<ArrowRight size={16} aria-hidden="true" /></button>
                        </PortalHeader>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <PortalStat value={loading ? '—' : subjects.length} label="Mata Pelajaran" icon={BookOpen} />
                            <PortalStat value={loading ? '—' : activeExams.length} label="Ujian" icon={ClipboardList} />
                            <PortalStat value={loading ? '—' : exams.filter(item => item.draf).length} label="Draf" icon={FilePenLine} />
                        </div>
                        <section className="space-y-3" aria-labelledby="recent-exams-title">
                            <header className="flex flex-wrap items-center justify-between gap-3">
                                <h2 id="recent-exams-title" className="text-lg font-bold">Ujian terbaru</h2>
                                <button type="button" className="ui-button ui-button-secondary" onClick={() => onNavigate('guru-ujian')}>Lihat semua<ArrowRight size={16} aria-hidden="true" /></button>
                            </header>
                            <div className="grid gap-4 md:grid-cols-2">
                                {activeExams.sort((a, b) => b.id - a.id).slice(0, 4).map(item => {
                                    const status = examStatus(item);
                                    return <article key={item.id} className="ui-card flex min-w-0 flex-col gap-4 p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays size={14} aria-hidden="true" />{schedule.format(new Date(item.waktuMulai))}</span>
                                            <span className={'ui-badge ' + examStatusStyles[status]}>{status}</span>
                                        </div>
                                        <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{item.mapel.nama}</h3>
                                            <ExamListMetadata exam={item} />
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                            <ExamActions exam={item} busy={busy} onOpen={openExam} />
                                        </div>
                                    </article>;
                                })}
                            </div>
                            {!loading && !activeExams.length && !error && <div className="ui-card space-y-3 p-8 text-center">
                                <ClipboardList size={32} className="mx-auto text-slate-300" aria-hidden="true" />
                                <p className="text-sm text-slate-500">Belum ada ujian.</p>
                                <button type="button" className={primaryClass} onClick={() => onNavigate('guru-mapel')}><Plus size={16} />Buat Ujian</button>
                            </div>}
                        </section>
                    </> : <header className="ui-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-8">
                        <h1 className="ui-page-title flex items-center gap-2.5">{view === 'ujian' ? <ClipboardList size={28} className="text-blue-600" aria-hidden="true" /> : <FilePenLine size={28} className="text-blue-600" aria-hidden="true" />}{view === 'ujian' ? 'Ujian Saya' : 'Buat Ujian'}</h1>
                        {view === 'ujian' ? <button type="button" className={primaryClass} onClick={() => onNavigate('guru-mapel')}><Plus size={18} aria-hidden="true" />Buat Ujian</button>
                            : <button type="button" className={backButtonClass} onClick={backToExams}><ArrowLeft size={17} aria-hidden="true" />Kembali</button>}
                    </header>}
                    {view === 'mapel' && !loading && assignments.length > 0 && <DraftExamForm assignments={assignments} examTypes={examTypes} onCreated={created => {
                        setExams(current => [created, ...current]); setDetailView('preview'); setPointSettings({}); setExam({ ...created, soal: [] });
                    }} />}
                    {view !== 'ujian' && loading && <p role="status">Memuat ujian…</p>}
                    {view === 'mapel' && !loading && !error && !assignments.length && <p className="text-sm text-slate-600">Belum ada penugasan mapel dan kelas. Hubungi admin untuk menambah penugasan.</p>}
                    {view === 'ujian' && <section className="space-y-3" aria-labelledby="exam-list-heading">
                        <div className="grid grid-cols-2 gap-2 sm:flex" role="group" aria-label="Tampilan daftar ujian">
                            <button type="button" aria-pressed={!archiveView} className={'ui-button ' + (!archiveView ? 'ui-button-soft' : 'ui-button-neutral-soft')} onClick={() => { setArchiveView(false); setNotice(''); }}><ClipboardList size={16} aria-hidden="true" />Daftar utama</button>
                            <button type="button" aria-pressed={archiveView} className={'ui-button ' + (archiveView ? 'ui-button-soft' : 'ui-button-neutral-soft')} onClick={() => { setArchiveView(true); setNotice(''); }}><Archive size={16} aria-hidden="true" />Arsip</button>
                        </div>
                        <div className="ui-card grid items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <label className="ui-label min-w-0">Cari ujian
                                <span className="relative mt-1 block">
                                    <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="search" placeholder="Mapel, jenis ujian, atau kelas" value={search} onChange={event => setSearch(event.target.value)} className="ui-input w-full pl-9" />
                                </span>
                            </label>
                            <label className="ui-label min-w-0">Tanggal mulai
                                <input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} className="ui-input mt-1 block w-full min-w-0" />
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
                            <h2 id="exam-list-heading" className="text-sm font-semibold text-slate-700">{archiveView ? 'Arsip ujian' : 'Daftar ujian'}{!loading && ` · ${matches.length}`}</h2>
                            {(search || examDate) && <button type="button" onClick={() => { setSearch(''); setExamDate(''); }} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"><X size={15} aria-hidden="true" />Reset filter</button>}
                        </div>
                        {loading && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat ujian…</p>}
                        {!loading && !error && !matches.length && <p className="ui-card p-5 text-sm text-slate-600">{listedExams.length ? 'Tidak ada ujian yang cocok dengan filter.' : archiveView ? 'Belum ada ujian di arsip.' : 'Belum ada ujian di daftar utama.'}</p>}
                        {!loading && <ul className="grid gap-3 xl:grid-cols-2">
                            {matches.map(item => {
                                const status = examStatus(item);
                                return <li key={item.id} className="ui-card flex min-w-0 flex-col gap-4 p-4 sm:p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <h3 className="min-w-0 break-words text-base font-semibold text-slate-900">{item.mapel.nama}</h3>
                                        <span className={'ui-badge whitespace-nowrap ' + examStatusStyles[status]}>{status}</span>
                                    </div>
                                    <div className="flex-1">
                                        <ExamListMetadata exam={item} />
                                        <p className="mt-3 text-xs text-slate-600">Mulai <time dateTime={item.waktuMulai}>{schedule.format(new Date(item.waktuMulai))} WIB</time></p>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                        <ExamActions exam={item} busy={busy} onOpen={openExam} />
                                        {item.draf && <button type="button" disabled={busy} className="ui-button ui-button-danger-soft" onClick={() => manageExam(item)}><Trash2 size={16} aria-hidden="true" />Hapus Draf</button>}
                                        {item.diarsipkanPada && <button type="button" disabled={busy} className="ui-button ui-button-soft" onClick={() => manageExam(item)}><ArchiveRestore size={16} aria-hidden="true" />Pulihkan</button>}
                                    </div>
                                </li>;
                            })}
                        </ul>}
                    </section>}
                </>
            )}
        </section>
    );
}

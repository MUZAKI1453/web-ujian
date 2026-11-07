import { useEffect, useState } from 'react';
import { BarChart3, ShieldAlert } from 'lucide-react';
import Select from '../../components/ui/Select';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import { examClassNames, type ExamRow } from './UjianGuru';
import { violationLabels } from '../siswa/useExamSecurity';

type Analytics = {
    rows: { siswa: { id: number; nama: string | null; username: string }; nilai: number | null; status: string }[];
    totalPelanggaran: number;
    pelanggaran: { id: number; siswa: string; alasan: keyof typeof violationLabels | null; waktu: string }[];
};

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
const bands = [
    { label: 'Di bawah 60', min: -Infinity, max: 60 },
    { label: '60–<70', min: 60, max: 70 },
    { label: '70–<80', min: 70, max: 80 },
    { label: '80–<90', min: 80, max: 90 },
    { label: '90 ke atas', min: 90, max: Infinity }
];

function ExamAnalytics({ examId }: { examId: string }) {
    const [data, setData] = useState<Analytics | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function refresh() {
            try {
                const response = await api.get<Analytics>(`/guru/ujian/${examId}/analitik`, { signal: controller.signal, timeout: 10000 });
                if (!controller.signal.aborted) { setData(response.data); setError(''); }
            } catch (err) {
                if (!controller.signal.aborted) setError(errorMessage(err));
            } finally {
                if (!controller.signal.aborted) timer = setTimeout(refresh, 15000);
            }
        }
        void refresh();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [examId]);

    const scores = data?.rows.flatMap(row => row.nilai === null ? [] : [row.nilai]) ?? [];
    const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
    const stats = [
        { label: 'Selesai dinilai', value: scores.length },
        { label: 'Menunggu penilaian', value: (data?.rows.length ?? 0) - scores.length },
        { label: 'Rata-rata', value: average },
        { label: 'Terendah', value: scores.length ? Math.min(...scores) : null },
        { label: 'Tertinggi', value: scores.length ? Math.max(...scores) : null }
    ];

    return <>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {!data && !error && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat analitik ujian…</p>}
        {data && <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {stats.map(stat => <div key={stat.label} className="ui-card p-4">
                    <dt className="text-xs font-medium text-slate-600">{stat.label}</dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stat.value === null ? '—' : number.format(stat.value)}</dd>
                </div>)}
            </dl>
            <section className="ui-card space-y-3 p-4 sm:p-5" aria-labelledby="score-distribution-title">
                <h2 id="score-distribution-title" className="font-semibold">Distribusi nilai</h2>
                {!scores.length ? <p className="text-sm text-slate-500">Belum ada nilai akhir.</p> : <ul className="space-y-2.5">
                    {bands.map(band => {
                        const count = scores.filter(value => value >= band.min && value < band.max).length;
                        return <li key={band.label} className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs sm:text-sm">
                            <span>{band.label}</span>
                            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                                <span className="block h-full rounded-full bg-blue-600" style={{ width: `${count / scores.length * 100}%` }} />
                            </span>
                            <span className="text-right tabular-nums">{count} siswa</span>
                        </li>;
                    })}
                </ul>}
            </section>
            <section className="ui-card overflow-x-auto" aria-labelledby="student-results-title">
                <h2 id="student-results-title" className="p-4 font-semibold sm:p-5">Hasil per siswa</h2>
                {data.rows.length ? <table className="ui-table">
                    <thead><tr><th scope="col">Siswa</th><th scope="col">Nilai</th><th scope="col">Status</th></tr></thead>
                    <tbody>{data.rows.map(row => <tr key={row.siswa.id}>
                        <td><span className="block break-words font-semibold">{row.siswa.nama || row.siswa.username}</span><span className="text-xs text-slate-500">{row.siswa.username}</span></td>
                        <td className="font-semibold tabular-nums">{row.nilai === null ? '—' : number.format(row.nilai)}</td>
                        <td><span className={'ui-badge ' + (row.nilai === null ? 'bg-yellow-100 text-yellow-900' : 'bg-green-50 text-green-700')}>{row.status}</span></td>
                    </tr>)}</tbody>
                </table> : <p className="px-4 pb-4 text-sm text-slate-500 sm:px-5">Belum ada kiriman siswa.</p>}
            </section>
            <section className="ui-card space-y-3 p-4 sm:p-5" aria-labelledby="exam-violations-title">
                <h2 id="exam-violations-title" className="flex items-center gap-2 font-semibold"><ShieldAlert size={19} className="text-yellow-800" aria-hidden="true" />Pelanggaran tercatat · {data.totalPelanggaran}</h2>
                {data.totalPelanggaran > data.pelanggaran.length && <p className="text-xs text-slate-500">Menampilkan {data.pelanggaran.length} kejadian terbaru.</p>}
                {!data.pelanggaran.length ? <p className="text-sm text-slate-500">Belum ada pelanggaran tercatat.</p> : <ul className="divide-y divide-slate-100">
                    {data.pelanggaran.map(event => <li key={event.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm">
                        <div className="min-w-0 flex-1"><p className="break-words font-semibold">{event.siswa}</p>
                            <p className="text-slate-600">{event.alasan ? violationLabels[event.alasan] ?? 'Peringatan keamanan ujian' : 'Peringatan keamanan ujian'}</p></div>
                        <time dateTime={event.waktu} className="text-xs text-slate-500">{date.format(new Date(event.waktu))} WIB</time>
                    </li>)}
                </ul>}
            </section>
        </>}
    </>;
}

export default function AnalitikUjian() {
    const [exams, setExams] = useState<ExamRow[]>([]);
    const [selected, setSelected] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        api.get<{ ujian: ExamRow[] }>('/guru/ujian', { signal: controller.signal, timeout: 10000 })
            .then(({ data }) => {
                if (controller.signal.aborted) return;
                const published = data.ujian.filter(exam => !exam.draf);
                setExams(published);
                if (published[0]) setSelected(String(published[0].id));
            })
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    return <section className="cbt-portal">
        <header className="ui-card p-5 sm:p-8">
            <h1 className="ui-page-title flex items-center gap-2"><BarChart3 size={26} className="text-blue-600" aria-hidden="true" />Analitik Ujian</h1>
            <p className="mt-2 text-sm text-slate-600">Tinjau nilai siswa dan catatan pelanggaran per ujian.</p>
        </header>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {loading && <p role="status" className="ui-card p-5 text-sm text-slate-500">Memuat daftar ujian…</p>}
        {!loading && !error && !exams.length && <p className="ui-card p-5 text-sm text-slate-500">Belum ada ujian terbit.</p>}
        {exams.length > 0 && <div className="ui-card p-4 sm:p-5">
            <label htmlFor="analytics-exam" className="ui-label">Pilih ujian</label>
            <Select id="analytics-exam" aria-label="Pilih ujian" value={selected} onValueChange={setSelected} className="mt-1 w-full max-w-xl">
                {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.mapel.nama} · {exam.judul} · {examClassNames(exam)} · {date.format(new Date(exam.waktuMulai))}</option>)}
            </Select>
        </div>}
        {selected && <ExamAnalytics key={selected} examId={selected} />}
    </section>;
}

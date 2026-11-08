import { useEffect, useState } from 'react';
import Select from '../../components/ui/Select';
import api from '../../services/api';
import QuestionContent from './QuestionContent';
import { questionTypeLabel } from './questionTypes';

export type QuestionAnalysis = {
    id: number;
    nomor: number;
    tipe: string;
    pertanyaan: string;
    adaGambar: boolean;
    status: 'aktif' | 'dibatalkan' | 'semua-benar';
    benar: number;
    salah: number;
    kosong: number;
    dikoreksi: number;
    rataPoin: number | null;
    dayaPembeda: number | null;
    poinMaksimum: number | null;
    opsi: { teks: string; benar: boolean; dipilih: number; korelasi: number | null; jarangDipilih: boolean }[];
};
export type Reliability = { kr20: number | null; jumlahSoal: number; minimumSampel: number };

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const segments = [
    { key: 'benar', label: 'Benar', color: 'bg-emerald-600' },
    { key: 'salah', label: 'Salah', color: 'bg-rose-500' },
    { key: 'kosong', label: 'Kosong', color: 'bg-slate-300' }
] as const;

function showQuestion(id: number) {
    const details = document.getElementById(`analytics-question-${id}`);
    if (!(details instanceof HTMLDetailsElement)) return;
    details.open = true;
    details.querySelector('summary')?.focus({ preventScroll: true });
    details.scrollIntoView({ block: 'nearest' });
}

type QuestionImages = { gambar?: string; items?: { gambar?: string }[] };

export default function QuestionAnalytics({ examId, questions, submissions, underReview, reliability }: {
    examId: string; questions: QuestionAnalysis[]; submissions: number; underReview: number; reliability: Reliability;
}) {
    const [sort, setSort] = useState('hardest');
    const [flaggedOnly, setFlaggedOnly] = useState(false);
    const [loadImages, setLoadImages] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [images, setImages] = useState<Record<number, QuestionImages>>({});
    useEffect(() => {
        if (!loadImages) return;
        const controller = new AbortController();
        api.get<{ soal: { id: number; isi: QuestionImages | null }[] }>(`/guru/ujian/${examId}`, { signal: controller.signal, timeout: 10000 })
            .then(({ data }) => {
                if (!controller.signal.aborted) setImages(Object.fromEntries(data.soal.map(row => [row.id, row.isi ?? {}])));
            })
            .catch(() => { if (!controller.signal.aborted) setImageError(true); });
        return () => controller.abort();
    }, [examId, loadImages]);
    const rankable = (row: QuestionAnalysis) => row.status === 'aktif' && row.tipe !== 'ESSAY' && submissions > 0;
    const ranked = questions.filter(rankable).sort((a, b) => a.benar - b.benar || a.nomor - b.nomor);
    const hardest = ranked[0];
    const easiest = ranked.find(row => row.benar === ranked[ranked.length - 1]?.benar);
    const flagged = questions.filter(row => row.dayaPembeda !== null && row.dayaPembeda < 0);
    const rows = [...(flaggedOnly && flagged.length ? flagged : questions)].sort((a, b) => {
        if (sort === 'number') return a.nomor - b.nomor;
        if (rankable(a) !== rankable(b)) return Number(rankable(b)) - Number(rankable(a));
        if (!rankable(a)) return a.nomor - b.nomor;
        return (sort === 'easiest' ? b.benar - a.benar : a.benar - b.benar) || a.nomor - b.nomor;
    });

    return <section className="ui-card space-y-4 p-4 sm:p-5" aria-labelledby="question-analysis-title">
        <div>
            <h2 id="question-analysis-title" className="font-semibold">Analisis per soal</h2>
            <p className="mt-1 text-sm text-slate-600">{submissions} siswa mengirim jawaban. Persentase benar mencakup siswa yang mengosongkan soal.</p>
            {underReview > 0 && <p className="mt-1 text-sm text-slate-600">{underReview} kiriman offline masih menunggu tinjauan dan belum masuk analisis.</p>}
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Reliabilitas KR-20 · {reliability.kr20 === null ? 'Belum tersedia' : number.format(reliability.kr20)}</p>
            <p className="mt-1 text-slate-600">{reliability.jumlahSoal} butir objektif · {submissions} kiriman. KR-20 mengukur konsistensi bagian objektif dengan skor 0/1.</p>
            {reliability.kr20 === null && <p className="mt-1 text-slate-600">Perlu minimal {reliability.minimumSampel} kiriman, dua butir objektif, dan variasi skor.</p>}
        </div>
        {hardest && easiest && <div className="grid gap-3 sm:grid-cols-2">
            {(hardest.benar === easiest.benar
                ? [{ label: ranked.length > 1 ? 'Semua soal objektif setara' : 'Satu soal objektif', row: hardest }]
                : [{ label: 'Tersulit', row: hardest }, { label: 'Termudah', row: easiest }]).map(({ label, row }) =>
                <button key={label} type="button" onClick={() => showQuestion(row.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50">
                    <span className="block text-xs font-medium text-slate-600">{label}</span>
                    <span className="mt-1 block text-sm font-semibold text-slate-900">Soal {row.nomor} · {row.benar} dari {submissions} siswa benar</span>
                </button>)}
        </div>}
        {!submissions ? <p className="text-sm text-slate-500">Analisis akan muncul setelah ada kiriman yang dapat dinilai.</p> : !rows.length ?
            <p className="text-sm text-slate-500">Belum ada soal untuk dianalisis.</p> : <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <label htmlFor="analytics-question-sort" className="ui-label">Urutkan soal</label>
                        <Select id="analytics-question-sort" value={sort} onValueChange={setSort} className="mt-1">
                            <option value="hardest">Tersulit dulu</option>
                            <option value="easiest">Termudah dulu</option>
                            <option value="number">Nomor soal</option>
                        </Select>
                    </div>
                    {flagged.length > 0 && <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={flaggedOnly} onChange={event => setFlaggedOnly(event.target.checked)} />
                        Hanya butir bertanda ({flagged.length})
                    </label>}
                    <ul className="flex flex-wrap gap-3 text-xs text-slate-600" aria-label="Legenda diagram jawaban">
                        {segments.map(segment => <li key={segment.key} className="flex items-center gap-1.5">
                            <span aria-hidden="true" className={`size-2.5 rounded-sm ${segment.color}`} />{segment.label}
                        </li>)}
                    </ul>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="ui-table">
                        <thead><tr>{['Soal', 'Benar', 'Salah', 'Kosong', 'Pola jawaban', 'Kategori / koreksi', 'Daya pembeda'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                        <tbody>{rows.map(row => {
                            const percent = row.benar / submissions * 100;
                            return <tr key={row.id}>
                                <td className="min-w-52">
                                    <details id={`analytics-question-${row.id}`} onToggle={event => {
                                        if (row.adaGambar && event.currentTarget.open) setLoadImages(true);
                                    }}>
                                        <summary className="cursor-pointer font-semibold text-blue-700">Soal {row.nomor}</summary>
                                        <div className="mt-2 space-y-2">
                                            <p className="whitespace-pre-wrap break-words"><QuestionContent text={row.pertanyaan} image={images[row.id]?.gambar} /></p>
                                            {row.adaGambar && !images[row.id] && <p className="text-xs text-slate-500">{imageError ? 'Gambar soal gagal dimuat.' : 'Memuat gambar soal…'}</p>}
                                            {row.opsi.length > 0 && <ul className="space-y-1 text-xs">
                                                {row.opsi.map((option, i) => <li key={i} className="break-words">
                                                    <strong>{row.tipe === 'BS' ? i + 1 : String.fromCharCode(65 + i)}.</strong>{' '}
                                                    <QuestionContent text={option.teks} image={images[row.id]?.items?.[i]?.gambar} />
                                                    {row.tipe !== 'BS' && row.status !== 'dibatalkan' && ` · ${option.dipilih} siswa`}
                                                    {row.status === 'aktif' && (row.tipe === 'BS' ? (option.benar ? ' · Benar' : ' · Salah') : option.benar && ' · Kunci')}
                                                    {row.status === 'aktif' && row.tipe === 'PG' && !option.benar && <>
                                                        {' · ' + number.format(option.dipilih / submissions * 100) + '% dari kiriman'}
                                                        {option.korelasi !== null && ` · Korelasi ${number.format(option.korelasi)}`}
                                                        {option.jarangDipilih && <span className="font-semibold text-amber-800"> · Pengecoh jarang dipilih</span>}
                                                        {option.korelasi !== null && option.korelasi > 0 && <span className="font-semibold text-amber-800"> · Lebih cenderung dipilih siswa dengan skor butir lain lebih tinggi</span>}
                                                    </>}
                                                </li>)}
                                            </ul>}
                                        </div>
                                    </details>
                                    <span className="text-xs text-slate-500">{questionTypeLabel(row.tipe)}</span>
                                </td>
                                {rankable(row) ? <>
                                    {segments.map(segment => <td key={segment.key} className="tabular-nums">{row[segment.key]}</td>)}
                                    <td className="min-w-36">
                                        <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
                                            {segments.map(segment => <span key={segment.key} className={segment.color} style={{ width: `${row[segment.key] / submissions * 100}%` }} />)}
                                        </div>
                                        <span className="mt-1 block whitespace-nowrap text-xs tabular-nums">{number.format(percent)}% benar</span>
                                    </td>
                                    <td>{percent < 30 ? 'Sulit' : percent < 70 ? 'Sedang' : 'Mudah'}</td>
                                </> : <>
                                    <td>—</td><td>—</td><td className="tabular-nums">{row.status === 'dibatalkan' ? '—' : row.kosong}</td><td>—</td>
                                    <td className="min-w-40">{row.status === 'dibatalkan' ? 'Dibatalkan' : row.status === 'semua-benar' ? 'Benar untuk semua' : <>
                                        <span className="block text-xs">{row.dikoreksi} dari {submissions} dikoreksi</span>
                                        <span className="block text-sm font-semibold">{row.rataPoin === null || row.poinMaksimum === null
                                            ? 'Belum ada poin' : `${number.format(row.rataPoin)} / ${number.format(row.poinMaksimum)} poin (rata-rata)`}</span>
                                    </>}</td>
                                </>}
                                <td className="min-w-32 tabular-nums">
                                    {row.dayaPembeda === null ? '—' : number.format(row.dayaPembeda)}
                                    {row.dayaPembeda !== null && row.dayaPembeda < 0 && <span className="mt-1 block text-xs font-semibold text-amber-800">Tinjau · negatif</span>}
                                </td>
                            </tr>;
                        })}</tbody>
                    </table>
                </div>
                <p className="text-xs text-slate-500">Sulit &lt;30% · Sedang 30%–&lt;70% · Mudah ≥70%. Soal dibatalkan dan soal benar untuk semua tidak masuk peringkat.</p>
                <p className="text-xs text-slate-500">Daya pembeda membandingkan benar atau salah pada satu butir dengan jumlah benar pada butir objektif lainnya. Tanda negatif dan pengecoh PG yang dipilih kurang dari 5% menjadi petunjuk untuk ditinjau.</p>
            </>}
    </section>;
}

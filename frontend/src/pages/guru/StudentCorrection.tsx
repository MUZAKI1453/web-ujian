import { FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import QuestionContent from './QuestionContent';
import { fieldClass, primaryClass } from './QuestionEditor';
import type { Question } from './QuestionEditor';

export type ReportRow = {
    id: number;
    siswa: { nama: string | null; username: string };
    nilai: string;
    pending: number;
    rincian: Record<string, { benar: number; total: number; poin: string; maksimum: string }>;
    jawaban: Record<string, unknown>;
    essay: { id: number; pedoman?: string; maksimum: number; jawaban: string; nilai: number | null }[];
};
export type EssayMark = { soalId: number; nilai: number };

export default function StudentCorrection({ row, questions, busy, onBack, onSave }: {
    row: ReportRow; questions: Question[]; busy: boolean; onBack: () => void; onSave: (marks: EssayMark[]) => void;
}) {
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const marks = row.essay.flatMap(essay => {
            const value = String(form.get('nilai-' + essay.id) ?? '').trim();
            if (!value || Number(value) === essay.nilai) return [];
            return [{ soalId: essay.id, nilai: Number(value) }];
        });
        if (marks.length) onSave(marks);
    }

    const automatic = questions.filter(q => !q.dibatalkan && q.tipeSoal !== 'ESSAY');
    const essays = new Map(row.essay.map(item => [item.id, item]));
    return <div className="space-y-4">
        <button type="button" disabled={busy} onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold">
            <ArrowLeft size={16} /> Kembali ke Rekap
        </button>
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <div>
                <p className="text-sm font-semibold text-blue-700">Koreksi Jawaban</p>
                <h2 className="text-xl font-bold">{row.siswa.nama || row.siswa.username}</h2>
                <p className="text-sm text-slate-600">NIS {row.siswa.username}</p>
            </div>
            <div><p className="text-sm text-slate-600">{row.pending ? 'Nilai sementara' : 'Nilai akhir'}</p>
                <strong className="text-3xl text-blue-800">{row.nilai}</strong></div>
            <ul className="flex w-full flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-sm text-slate-700">
                {Object.entries(row.rincian).map(([type, value]) => <li key={type}>{type} · {value.poin}/{value.maksimum} poin</li>)}
            </ul>
        </header>
        {automatic.length > 0 && <section className="overflow-hidden rounded-xl border bg-white">
            <h3 className="bg-blue-700 px-4 py-3 font-semibold text-white">Jawaban Otomatis</h3>
            <div className="divide-y">{automatic.map(q => {
                const value = row.jawaban[q.id];
                return <article key={q.id} className="space-y-3 p-4">
                    <h4 className="font-semibold">Soal {questions.indexOf(q) + 1} · {q.tipeSoal}</h4>
                    <div className="whitespace-pre-wrap break-words"><QuestionContent text={q.pertanyaan} image={q.isi?.gambar} /></div>
                    {q.tipeSoal === 'ISIAN' ? <div className="grid gap-2 sm:grid-cols-2 text-sm">
                        <p className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3">Jawaban siswa · {typeof value === 'string' && value.trim() ? value : 'Kosong'}</p>
                        <p className="rounded-lg bg-emerald-50 p-3">Jawaban diterima · {q.isi?.jawaban?.join(' / ') || '—'}</p>
                    </div> : <ul className="grid gap-2 sm:grid-cols-2">
                        {q.isi?.items?.map((item, i) => {
                            const bs = q.tipeSoal === 'BS';
                            const picked = bs ? Array.isArray(value) && typeof value[i] === 'boolean'
                                : Array.isArray(value) ? value.includes(i) : value === i;
                            const correct = bs ? picked && Array.isArray(value) && value[i] === item.benar : item.benar;
                            return <li key={i} className={'rounded-lg border p-3 text-sm ' + (correct ? 'border-emerald-200 bg-emerald-50' : picked ? 'border-red-200 bg-red-50' : 'bg-slate-50')}>
                                <QuestionContent text={item.teks} image={item.gambar} />
                                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                                    {picked && <span>Siswa{bs && Array.isArray(value) ? ' · ' + (value[i] ? 'Benar' : 'Salah') : ' · Dipilih'}</span>}
                                    {(bs || item.benar) && <span className="text-emerald-800">Kunci{bs ? ' · ' + (item.benar ? 'Benar' : 'Salah') : ''}</span>}
                                </div>
                            </li>;
                        })}
                    </ul>}
                </article>;
            })}</div>
        </section>}
        {row.essay.length > 0 && <form onSubmit={submit} className="overflow-hidden rounded-xl border bg-white">
            <h3 className="bg-amber-300 px-4 py-3 font-semibold text-slate-900">Koreksi Jawaban Essay</h3>
            <div className="divide-y">{questions.map((q, index) => {
                const essay = essays.get(q.id);
                if (!essay) return null;
                return <article key={q.id + ':' + essay.nilai} className="space-y-3 p-4">
                    <h4 className="font-semibold">Soal {index + 1}</h4>
                    <div className="whitespace-pre-wrap break-words"><QuestionContent text={q.pertanyaan} image={q.isi?.gambar} /></div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-bold uppercase text-blue-800">Jawaban siswa</p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{typeof essay.jawaban === 'string' && essay.jawaban.trim() ? essay.jawaban : 'Tidak ada jawaban.'}</p>
                    </div>
                    {essay.pedoman && <p className="text-sm text-slate-700">Pedoman · {essay.pedoman}</p>}
                    <div className="max-w-40">
                        <label className="text-sm font-semibold">Nilai (0–{essay.maksimum})
                            <input name={'nilai-' + essay.id} type="number" min={0} max={essay.maksimum} step={1}
                                defaultValue={essay.nilai ?? ''} className={fieldClass} disabled={busy} />
                        </label>
                    </div>
                </article>;
            })}</div>
            <div className="flex justify-end border-t p-4"><button type="submit" disabled={busy} className={primaryClass}>Simpan Nilai Essay</button></div>
        </form>}
    </div>;
}

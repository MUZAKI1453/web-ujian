import { questionTypeLabel, questionTypeLabels } from './questionTypes';
import { fieldClass, primaryClass } from '../../components/ui/styles';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, KeyRound, Save, X } from 'lucide-react';
import QuestionContent from './QuestionContent';
import type { Question } from './QuestionEditor';
import { essayMarks } from './correctionForm';

export type ReportRow = {
    id: number;
    siswa: { nama: string | null; username: string };
    nilai: string;
    pending: number;
    rincian: Record<string, { benar: number; total: number; poin: string; maksimum: string }>;
    jawaban: Record<string, unknown>;
    penilaian?: Record<string, { benar: boolean; poin: string; maksimum: string }>;
    essay: { id: number; pedoman?: string; maksimum: number; jawaban: string; nilai: number | null; catatan?: string }[];
};
export type EssayMark = { soalId: number; nilai: number; catatan: string };

function AutomaticAnswer({ question, value, result }: { question: Question; value: unknown; result?: { benar: boolean; poin: string; maksimum: string } }) {
    const items = question.isi?.items ?? [];
    const selected = items.flatMap((_, index) => (Array.isArray(value) ? value.includes(index) : value === index) ? [String.fromCharCode(65 + index)] : []);
    const answered = typeof value === 'string' && !!value.trim();
    return <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        {question.tipeSoal === 'BS' ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full table-fixed text-left text-xs">
                <thead className="border-b bg-slate-100/70 text-slate-500"><tr><th scope="col" className="px-3 py-3">Pernyataan</th><th scope="col" className="w-16 px-1 py-3 text-center sm:w-20">Siswa</th><th scope="col" className="w-16 px-1 py-3 text-center sm:w-20">Kunci</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{items.map((item, index) => {
                    const answer = Array.isArray(value) && typeof value[index] === 'boolean' ? value[index] as boolean : null;
                    return <tr key={index}>
                        <th scope="row" className="px-3 py-3 font-normal"><span className="mb-1 block font-semibold text-slate-600">Pernyataan {index + 1}</span><QuestionContent text={item.teks} image={item.gambar} /></th>
                        <td className="px-1 py-3 text-center"><span className={'inline-flex rounded-lg px-2 py-1.5 font-medium ' + (answer === null ? 'bg-slate-100 text-slate-500' : answer === item.benar ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{answer === null ? 'Kosong' : answer ? 'Benar' : 'Salah'}</span></td>
                        <td className="px-1 py-3 text-center font-medium text-slate-700">{item.benar ? 'Benar' : 'Salah'}</td>
                    </tr>;
                })}</tbody>
            </table>
        </div> : question.tipeSoal === 'ISIAN' ? <>
            <div className={'space-y-2 rounded-xl border p-3 ' + (result?.benar ? 'border-green-200 bg-green-50' : answered && result ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-500">Jawaban siswa</p>
                    <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ' + (result?.benar ? 'bg-green-100 text-green-800' : answered && result ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}>
                        {result?.benar ? <Check size={14} aria-hidden="true" /> : answered && result ? <X size={14} aria-hidden="true" /> : null}
                        {result?.benar ? 'Benar' : !answered ? 'Belum dijawab' : result ? 'Salah' : 'Menunggu penilaian'}
                    </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{answered ? String(value) : '—'}</p>
            </div>
            <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">Kunci jawaban</p>{question.isi?.jawaban?.map((answer, index) => <div key={index} className="whitespace-pre-wrap break-words rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm">{answer}</div>)}</div>
        </> : <>
            <ol className="grid gap-2 sm:grid-cols-2">{items.map((item, index) => {
                const picked = selected.includes(String.fromCharCode(65 + index));
                return <li key={index} className={'flex items-start gap-3 rounded-xl border p-3 text-sm ' + (item.benar ? 'border-green-200 bg-green-50' : picked ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
                    <span className={'grid size-8 shrink-0 place-items-center rounded-lg font-semibold ' + (picked ? item.benar ? 'bg-green-700 text-white' : 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500')}>{String.fromCharCode(65 + index)}</span>
                    <div className="min-w-0 flex-1 break-words"><QuestionContent text={item.teks} image={item.gambar} /></div>
                    {(picked || item.benar) && <span role="img" aria-label={picked ? item.benar ? 'Jawaban benar dipilih' : 'Jawaban salah dipilih' : 'Kunci belum dipilih'} title={picked ? item.benar ? 'Jawaban benar dipilih' : 'Jawaban salah dipilih' : 'Kunci belum dipilih'} className={'shrink-0 ' + (item.benar ? 'text-green-700' : 'text-red-600')}>
                        {picked ? item.benar ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
                    </span>}
                </li>;
            })}</ol>
        </>}
    </div>;
}

export default function StudentCorrection({ row, questions, busy, onBack, onSave }: {
    row: ReportRow; questions: Question[]; busy: boolean; onBack: () => void; onSave: (marks: EssayMark[]) => void;
}) {
    const [activeType, setActiveType] = useState<string>(() => row.pending ? 'ESSAY' : questions.find(question => !question.dibatalkan)?.tipeSoal ?? 'PG');
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        const invalid = Array.from(event.currentTarget.elements).find((element): element is HTMLInputElement => element instanceof HTMLInputElement && element.willValidate && !element.validity.valid);
        if (invalid) {
            setActiveType('ESSAY');
            requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
            return;
        }
        const form = new FormData(event.currentTarget);
        const marks = essayMarks(row.essay, form);
        if (marks.length) onSave(marks);
    }
    const essays = new Map(row.essay.map(item => [item.id, item]));
    const visible = questions.filter(question => !question.dibatalkan && (question.tipeSoal !== 'ESSAY' || essays.has(question.id)));
    return <div className="space-y-4">
        <button type="button" disabled={busy} onClick={onBack} className="ui-button ui-button-secondary border bg-white"><ArrowLeft size={16} aria-hidden="true" />Kembali ke Rekap</button>
        <header className="ui-card flex flex-wrap items-start justify-between gap-4 bg-white p-5">
            <div><p className="text-sm font-semibold text-blue-700">Koreksi Jawaban</p><h2 className="ui-page-title">{row.siswa.nama || row.siswa.username}</h2><p className="text-sm text-slate-500">NIS {row.siswa.username}</p></div>
            <div className="rounded-xl bg-blue-50 px-5 py-3 text-right"><p className="text-xs text-slate-500">{row.pending ? 'Nilai sementara' : 'Nilai akhir'}</p><strong className="text-3xl text-blue-800">{Number(row.nilai)}</strong></div>
            <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                    <caption className="sr-only">Rincian nilai per tipe soal</caption>
                    <thead className="border-b bg-slate-100/70 text-xs text-slate-500"><tr><th scope="col" className="px-4 py-3">Tipe soal</th><th scope="col" className="px-4 py-3 text-right">Nilai</th><th scope="col" className="px-4 py-3 text-right">Maksimum</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{Object.keys(questionTypeLabels).filter(type => row.rincian[type]).map(type => {
                        const value = row.rincian[type];
                        return <tr key={type}><th scope="row" className="px-4 py-3 font-normal text-slate-700">{questionTypeLabel(type)}</th><td className="px-4 py-3 text-right font-medium tabular-nums">{Number(value.poin)}</td><td className="px-4 py-3 text-right text-slate-500 tabular-nums">{Number(value.maksimum)}</td></tr>;
                    })}</tbody>
                    <tfoot className="border-t bg-slate-50"><tr><th scope="row" className="px-4 py-3">Total</th><td className="px-4 py-3 text-right font-semibold tabular-nums">{Number(row.nilai)}</td><td className="px-4 py-3 text-right font-medium text-slate-500 tabular-nums">{Math.round(Object.values(row.rincian).reduce((total, value) => total + Number(value.maksimum), 0) * 10000) / 10000}</td></tr></tfoot>
                </table>
            </div>
        </header>
        <nav aria-label="Tipe soal untuk koreksi" className="grid grid-cols-2 gap-2 rounded-xl border bg-white p-2 lg:grid-cols-5">
            {Object.entries(questionTypeLabels).map(([type, label]) => <button key={type} type="button" disabled={busy} aria-pressed={activeType === type}
                onClick={() => setActiveType(type)} className={'flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm font-semibold ' + (activeType === type ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                {label}<span className={'rounded-full px-2 py-0.5 text-xs ' + (activeType === type ? 'bg-white/20' : 'bg-slate-100')}>{visible.filter(question => question.tipeSoal === type).length}</span>
            </button>)}
        </nav>
        <form onSubmit={submit} noValidate className="space-y-4">
            {!visible.some(question => question.tipeSoal === activeType) && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada soal pada tipe ini.</p>}
            {questions.map((question, index) => {
                if (!visible.includes(question)) return null;
                const essay = essays.get(question.id);
                return <article key={question.id + ':' + essay?.nilai + ':' + essay?.catatan} hidden={question.tipeSoal !== activeType} className="ui-card space-y-4 bg-white p-5">
                    <h3 className="flex flex-wrap items-center gap-3 text-base font-semibold text-slate-900"><span>Soal {index + 1}</span><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (question.tipeSoal === 'ESSAY' ? 'bg-slate-100 text-slate-800' : 'bg-blue-100 text-blue-800')}>{questionTypeLabel(question.tipeSoal)}</span></h3>
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed"><QuestionContent text={question.pertanyaan} image={question.isi?.gambar} /></div>
                    {!essay ? <AutomaticAnswer question={question} value={row.jawaban[question.id]} result={row.penilaian?.[question.id]} /> : <>
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Jawaban siswa</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{typeof essay.jawaban === 'string' && essay.jawaban.trim() ? essay.jawaban : 'Belum dijawab'}</p></div>
                        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold">Penilaian</h4><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (essay.nilai === null ? 'bg-slate-100 text-slate-800' : 'bg-blue-100 text-blue-800')}>{essay.nilai === null ? 'Belum dinilai' : 'Sudah dinilai'}</span></div>
                                <label className="ml-auto inline-flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                                    <span className="sr-only">Nilai soal {index + 1}, maksimum {essay.maksimum}</span>
                                    <input name={'nilai-' + essay.id} type="number" min={0} max={essay.maksimum} step={1} defaultValue={essay.nilai ?? ''} disabled={busy} placeholder="Nilai"
                                        className="min-h-11 w-24 border-0 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900 disabled:bg-slate-100" />
                                    <span className="border-l border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">/ {essay.maksimum}</span>
                                </label>
                            </div>
                            <label className="ui-label block">Catatan untuk siswa (opsional)<textarea name={'catatan-' + essay.id} maxLength={2000} rows={3} defaultValue={essay.catatan ?? ''} className={fieldClass} disabled={busy} placeholder="Tulis umpan balik…" /></label>
                        </div>
                    </>}
                </article>;
            })}
            {row.essay.length > 0 && <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                <span className="text-sm text-slate-500">{row.pending ? row.pending + ' esai belum dinilai' : 'Semua esai sudah dinilai'}</span>
                <button type="submit" disabled={busy} className={primaryClass}><Save size={17} aria-hidden="true" />{busy ? 'Menyimpan…' : 'Simpan Nilai'}</button>
            </div>}
        </form>
    </div>;
}

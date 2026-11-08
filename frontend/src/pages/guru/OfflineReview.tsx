import { useEffect, useState } from 'react';
import api from '../../services/api';
import { errorMessage, type Question } from './QuestionEditor';
import QuestionContent from './QuestionContent';

type Difference = { soalId: number; nomor: number; lokal: unknown; server: unknown };

function answerText(value: unknown, question?: Question) {
    if (value === null) return 'Kosong';
    if (question?.tipeSoal === 'BS' && Array.isArray(value)) {
        return value.map((item, index) => `${index + 1}. ${item === null ? 'Kosong' : item ? 'Benar' : 'Salah'}`).join('\n');
    }
    if (question?.tipeSoal === 'PG' || question?.tipeSoal === 'PM') {
        return (Array.isArray(value) ? value : [value]).map(index => {
            const item = question.isi?.items?.[index as number];
            return `${String.fromCharCode(65 + Number(index))}${item ? '. ' + item.teks : ''}`;
        }).join('\n');
    }
    return String(value);
}

export default function OfflineReview({ url, questions, busy, onDecide }: {
    url: string; questions: Question[]; busy: boolean; onDecide: (accept: boolean) => void;
}) {
    const [differences, setDifferences] = useState<Difference[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        api.get<{ perbedaan: Difference[] }>(url, { signal: controller.signal, timeout: 10000 })
            .then(({ data }) => { if (!controller.signal.aborted) setDifferences(data.perbedaan); })
            .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
        return () => controller.abort();
    }, [url]);

    if (error) return <p role="alert" className="ui-notice ui-notice-error">{error}</p>;
    if (!differences) return <p role="status">Memuat perbandingan jawaban…</p>;
    return <div className="space-y-3">
        <p className="text-slate-600">{differences.length ? `${differences.length} soal berbeda. Pilihan berlaku untuk seluruh kiriman.` : 'Tidak ada perbedaan jawaban antara perangkat dan server.'}</p>
        {differences.map(row => {
            const question = questions.find(item => item.id === row.soalId);
            return <article key={row.soalId} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <h4 className="font-semibold">Soal {row.nomor}{question?.dibatalkan && ' · Dibatalkan'}</h4>
                {question && <div className="break-words"><QuestionContent text={question.pertanyaan} image={question.isi?.gambar} /></div>}
                <dl className="grid gap-2 sm:grid-cols-2">
                    {[{ label: 'Di perangkat siswa', value: row.lokal }, { label: 'Di server', value: row.server }].map(side =>
                        <div key={side.label} className="min-w-0 rounded-lg bg-slate-50 p-3">
                            <dt className="mb-1 text-xs font-semibold text-slate-600">{side.label}</dt>
                            <dd className="whitespace-pre-wrap break-words">{answerText(side.value, question)}</dd>
                        </div>)}
                </dl>
            </article>;
        })}
        <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className="ui-button ui-button-primary" onClick={() => onDecide(true)}>Gunakan jawaban perangkat</button>
            <button type="button" disabled={busy} className="ui-button ui-button-secondary" onClick={() => onDecide(false)}>Gunakan jawaban server</button>
        </div>
    </div>;
}

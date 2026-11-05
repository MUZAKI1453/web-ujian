import { primaryClass } from '../../components/ui/styles';
import { useState } from 'react';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';

export const specialPointTypes = ['PM', 'BS', 'ISIAN'] as const;
export type PointSettings = Partial<Record<typeof specialPointTypes[number], string>>;
interface PointRow { id: number; tipeSoal: string; source: string; poin: string }

export default function PublishExam({ examId, settings, hasQuestions, onPublish }: { examId: number; settings: PointSettings; hasQuestions: boolean; onPublish: (questions: Question[]) => void }) {
    const [rows, setRows] = useState<PointRow[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function calculate(publish: boolean) {
        if (publish && !confirm('Terbitkan ujian dan bekukan daftar soal serta poin?')) return;
        setError('');
        setBusy(true);
        const poinKhusus = Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Number(value)]));
        try {
            const url = '/guru/ujian/' + examId;
            const { data: preview } = await api.post<{ rows: PointRow[] }>(url + '/poin', { poinKhusus });
            if (publish) {
                const { data } = await api.post<{ soal: Question[] }>(url + '/terbit', { poinKhusus, pratinjau: preview.rows });
                onPublish(data.soal);
            } else {
                setRows(preview.rows);
            }
        } catch (err) {
            setError(errorMessage(err));
            setRows([]);
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="space-y-4 rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold">Terbitkan Ujian</h2>
                    <p className="text-sm text-slate-600">Pembagian poin dihitung saat ujian diterbitkan. Total poin maksimum harus 100.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !hasQuestions} onClick={() => void calculate(false)}
                    className="ui-button ui-button-secondary border">Pratinjau Pembagian Poin</button>
                <button type="button" disabled={busy || !hasQuestions} onClick={() => void calculate(true)} className={primaryClass}>Terbitkan Ujian</button>
                </div>
            </div>
            {rows.length > 0 && <table className="ui-table w-full text-left text-sm">
                <thead className="bg-slate-50"><tr>{['Soal', 'Tipe', 'Sumber poin', 'Poin'].map(title => <th key={title} scope="col" className="p-2">{title}</th>)}</tr></thead>
                <tbody>{rows.map((row, index) => <tr key={row.id} className="border-b">
                    <td className="p-2">{index + 1}</td><td className="p-2">{row.tipeSoal}</td><td className="p-2">{row.source}</td><td className="p-2">{row.poin}</td>
                </tr>)}</tbody>
                <tfoot><tr><th scope="row" colSpan={3} className="p-2">Total</th><td className="p-2 font-semibold">100.0000</td></tr></tfoot>
            </table>}
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {rows.length > 0 && <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setRows([])} className="ui-button ui-button-secondary border">Tutup Pratinjau</button>
            </div>}
        </section>
    );
}

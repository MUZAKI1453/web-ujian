import { primaryClass } from '../../components/ui/styles';
import { useState } from 'react';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import { questionTypeLabel } from './questionTypes';
import Select from '../../components/ui/Select';
import { Calculator, Send, X } from 'lucide-react';

export const specialPointTypes = ['PM', 'BS', 'ISIAN'] as const;
export type PointSettings = Partial<Record<typeof specialPointTypes[number], string>>;
interface PointRow { id: number; tipeSoal: string; source: string; poin: string }

export default function PublishExam({ examId, settings, questions, onSettingsChange, onPublish }: {
    examId: number; settings: PointSettings; questions: Question[];
    onSettingsChange: (settings: PointSettings) => void; onPublish: (questions: Question[]) => void;
}) {
    const [rows, setRows] = useState<PointRow[]>([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const hasQuestions = questions.length > 0;
    const pointTypes = specialPointTypes.filter(type => questions.some(question => question.tipeSoal === type));
    const formatPoints = (value: number | string) => Number(value).toLocaleString('id-ID', { maximumFractionDigits: 4 });
    function updateSettings(next: PointSettings) {
        onSettingsChange(next);
        setRows([]);
        setError('');
    }
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
            setPreviewOpen(true);
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="space-y-4 rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold">Publikasi</h2>
                    <p className="text-sm text-slate-500">Total 100 poin</p>
                </div>
                <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !hasQuestions} aria-expanded={previewOpen} onClick={() => {
                    setPreviewOpen(true);
                    void calculate(false);
                }} className="ui-button ui-button-secondary border"><Calculator size={16} aria-hidden="true" />{busy ? 'Menghitung…' : 'Hitung Poin'}</button>
                <button type="button" disabled={busy || !hasQuestions} onClick={() => void calculate(true)} className={primaryClass}><Send size={16} aria-hidden="true" />Terbitkan Ujian</button>
                </div>
            </div>
            {previewOpen && <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">Pembagian poin</h3>
                    <button type="button" disabled={busy} aria-label="Tutup pratinjau poin" title="Tutup pratinjau"
                        className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-200" onClick={() => setPreviewOpen(false)}><X size={18} aria-hidden="true" /></button>
                </div>
                {questions.length > 0 && questions.every(question => question.tipeSoal === 'ESSAY') && <p className="text-xs text-slate-500">Bobot esai disesuaikan ke total 100. Batas nilai koreksi mengikuti poin maksimum tiap soal.</p>}
                {pointTypes.length > 0 && <div className="grid gap-3 lg:grid-cols-3">
                    {pointTypes.map(type => <div key={type} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <h4 className="text-sm font-semibold text-slate-800">{questionTypeLabel(type)}</h4>
                        <div className="flex items-center gap-2">
                        <Select className="min-w-0 flex-1" aria-label={'Pembagian poin ' + questionTypeLabel(type)} disabled={busy} value={settings[type] === undefined ? 'auto' : 'manual'}
                            onValueChange={value => updateSettings({ ...settings, [type]: value === 'manual' ? '1' : undefined })}>
                            <option value="auto">Otomatis</option><option value="manual">Poin khusus</option>
                        </Select>
                        {settings[type] !== undefined && <label className="block w-24 shrink-0">
                            <span className="sr-only">Poin per soal {questionTypeLabel(type)}</span>
                            <input type="number" min="0.0001" max="100" step="0.0001" disabled={busy} className="ui-input w-full" title="Poin per soal" placeholder="Poin / soal"
                                value={settings[type]} onChange={event => updateSettings({ ...settings, [type]: event.target.value })} />
                        </label>}
                        </div>
                    </div>)}
                </div>}
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                {rows.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b bg-slate-100/70 text-xs text-slate-500"><tr>
                            <th scope="col" className="px-4 py-3">Soal</th><th scope="col" className="px-4 py-3">Tipe</th><th scope="col" className="px-4 py-3 text-right">Poin</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.id}>
                            <td className="px-4 py-3 text-slate-500">{index + 1}</td><td className="px-4 py-3">{questionTypeLabel(row.tipeSoal)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatPoints(row.poin)}</td>
                        </tr>)}</tbody>
                        <tfoot className="border-t bg-slate-50"><tr><th scope="row" colSpan={2} className="px-4 py-3">Total</th>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPoints(rows.reduce((total, row) => total + Math.round(Number(row.poin) * 10000), 0) / 10000)}</td>
                        </tr></tfoot>
                    </table>
                </div>}
                {!busy && !rows.length && !error && <p role="status" className="text-sm text-slate-500">Hitung poin untuk memperbarui pratinjau.</p>}
            </div>}
        </section>
    );
}

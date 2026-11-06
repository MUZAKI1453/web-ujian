import Select from '../../components/ui/Select';
import { useEffect, useId, useRef, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import QuestionImageUpload from './QuestionImageUpload';
import { fieldClass } from '../../components/ui/styles';
import { questionTypeLabels as typeLabels } from './questionTypes';
export { fieldClass, primaryClass } from '../../components/ui/styles';

const types = ['PG', 'PM', 'BS', 'ISIAN', 'ESSAY'] as const;
const addRowClass = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
type QuestionType = typeof types[number];
type Item = { teks: string; benar: boolean; gambar?: string };
export interface Question {
    id: number;
    tipeSoal: QuestionType;
    pertanyaan: string;
    bobot: string;
    dibatalkan?: boolean;
    isi: { gambar?: string; items?: Item[]; jawaban?: string[]; angka?: boolean; pedoman?: string } | null;
}

export function errorMessage(error: unknown) {
    return isAxiosError(error) ? error.response?.data?.message || 'Permintaan gagal. Coba lagi.' : 'Permintaan gagal. Coba lagi.';
}

function emptyItems(type: QuestionType): Item[] {
    return Array.from({ length: type === 'BS' ? 1 : 2 }, () => ({ teks: '', benar: false }));
}

function initialQuestion(question: Question | null, defaultType: QuestionType) {
    const tipeSoal = question?.tipeSoal ?? defaultType;
    return {
        tipeSoal, pertanyaan: question?.pertanyaan ?? '', gambar: question?.isi?.gambar ?? '',
        items: question?.isi?.items ?? emptyItems(tipeSoal), jawaban: question?.isi?.jawaban ?? [''],
        angka: question?.isi?.angka ?? false, pedoman: question?.isi?.pedoman ?? '',
        poin: question?.tipeSoal === 'ESSAY' ? Number(question.bobot) : 1
    };
}

export default function QuestionEditor({ question, number, onRemove, focus, defaultType = 'PG' }: {
    question: Question | null; number: number; onRemove: () => void; focus?: boolean;
    defaultType?: QuestionType;
}) {
    const [initial] = useState(() => initialQuestion(question, defaultType));
    const type = initial.tipeSoal;
    const [text, setText] = useState(initial.pertanyaan);
    const [image, setImage] = useState(initial.gambar);
    const [items, setItems] = useState(() => initial.items.map((item, editorKey) => ({ ...item, editorKey })));
    const nextItemKey = useRef(initial.items.length);
    const answerId = useId();
    const multipleAnswerInput = useRef<HTMLInputElement>(null);
    const [assignedStatements, setAssignedStatements] = useState(() => new Set(question?.tipeSoal === 'BS' ? initial.items.map((_, key) => key) : []));
    const [answers, setAnswers] = useState(() => (initial.jawaban.length ? initial.jawaban : ['']).map((value, key) => ({ value, key })));
    const nextAnswerKey = useRef(answers.length);
    const [points, setPoints] = useState(initial.poin);
    const [reading, setReading] = useState(0);
    useEffect(() => {
        multipleAnswerInput.current?.setCustomValidity(items.filter(item => item.benar).length < 2 ? 'Pilih minimal dua opsi sebagai jawaban benar.' : '');
    }, [items]);
    const updateItem = (key: number, values: Partial<Item>) => {
        setItems(current => current.map(item => item.editorKey === key ? { ...item, ...values } : item));
    };
    const onReadingChange = (delta: number) => setReading(current => current + delta);
    const soal = { tipeSoal: type, pertanyaan: text, gambar: image, items: items.map(({ editorKey: _key, ...item }) => item), jawaban: answers.map(answer => answer.value), angka: initial.angka, pedoman: initial.pedoman, poin: points };
    const changed = !question || JSON.stringify(soal) !== JSON.stringify(initial);

    return (
        <section className="ui-card overflow-hidden border bg-white">
            {question && <input type="hidden" name="soalAktif" value={question.id} />}
            {changed && <input type="hidden" name="perubahan" value={JSON.stringify({ id: question?.id ?? null, nomor: number, soal })} />}
            {reading > 0 && <input type="hidden" name="gambarDiproses" value="1" />}
            <div className="space-y-4 p-5">
                <QuestionImageUpload fieldLabel={'Pertanyaan soal ' + number} label="Gambar soal" value={image} onChange={setImage} onReadingChange={onReadingChange}
                    heading={<h2 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-base font-semibold text-slate-900">
                        <span>Soal {number}</span>
                        <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (type === 'ESSAY' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800')}>{typeLabels[type]}</span>
                    </h2>}
                    headerAction={<button type="button" aria-label={'Hapus soal ' + number} title="Hapus soal"
                        className="grid size-11 shrink-0 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                        onClick={onRemove}><Trash2 size={18} aria-hidden="true" /></button>}>
                    {inputId => <textarea id={inputId} className={fieldClass} autoFocus={focus} required maxLength={12000} rows={3} value={text} onChange={e => setText(e.target.value)} />}
                </QuestionImageUpload>
                {(type === 'PG' || type === 'PM' || type === 'BS') && (
                    <fieldset aria-label={type === 'BS' ? 'Pernyataan soal' : 'Opsi jawaban soal'} className="space-y-3">
                        {items.map((item, index) => (
                            <div key={item.editorKey} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <QuestionImageUpload fieldLabel={type === 'BS' ? 'Pernyataan ' + (index + 1) : 'Opsi ' + String.fromCharCode(65 + index)}
                                    label="Gambar" value={item.gambar ?? ''} onChange={gambar => updateItem(item.editorKey, { gambar })} onReadingChange={onReadingChange}
                                    inputAction={<button type="button" aria-label={type === 'BS' ? 'Hapus pernyataan ' + (index + 1) : 'Hapus opsi ' + String.fromCharCode(65 + index)}
                                        title={type === 'BS' ? 'Hapus pernyataan' : 'Hapus opsi'} disabled={items.length <= (type === 'BS' ? 1 : 2)}
                                        className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                                        onClick={() => setItems(current => current.filter((_, i) => i !== index))}>
                                        <Trash2 size={17} aria-hidden="true" />
                                    </button>}>
                                    {inputId => <input id={inputId} required maxLength={12000} className={fieldClass} value={item.teks}
                                        onChange={e => updateItem(item.editorKey, { teks: e.target.value })} />}
                                </QuestionImageUpload>
                            </div>
                        ))}
                        <button type="button" className={addRowClass}
                            onClick={() => {
                                const editorKey = nextItemKey.current++;
                                setItems(current => [...current, { teks: '', benar: false, editorKey }]);
                            }}>
                            <Plus size={18} aria-hidden="true" /> {type === 'BS' ? 'Tambah Pernyataan' : 'Tambah Opsi'}
                        </button>
                        <section aria-labelledby={answerId + '-title'} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-blue-700"><KeyRound size={18} aria-hidden="true" /></span>
                                <div className="min-w-0">
                                    <h3 id={answerId + '-title'} className="text-sm font-semibold text-slate-900">Kunci jawaban</h3>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{type === 'PG' ? 'Pilih satu opsi yang benar.' : type === 'PM' ? 'Centang minimal dua opsi yang benar. Opsi lain dianggap salah.' : 'Tentukan Benar atau Salah untuk setiap pernyataan pada tabel ini.'}</p>
                                </div>
                            </div>
                        {type === 'PG' && <label className="ui-label block">Jawaban benar
                            <Select className={fieldClass} required value={items.find(item => item.benar)?.editorKey.toString() ?? ''}
                                onValueChange={value => setItems(current => current.map(item => ({ ...item, benar: String(item.editorKey) === value })))}>
                                <option value="" disabled>Pilih jawaban yang benar</option>
                                {items.map((item, index) => <option key={item.editorKey} value={String(item.editorKey)}>
                                    {'Opsi ' + String.fromCharCode(65 + index)}
                                </option>)}
                            </Select>
                        </label>}
                        {type === 'PM' && <div className="space-y-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                                {items.map((item, index) => <label key={item.editorKey}
                                    className={'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 ' + (item.benar ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-400')}>
                                    <span className={'grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold ' + (item.benar ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600')} aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-slate-800">{'Opsi ' + String.fromCharCode(65 + index)}</span>
                                        <span className="mt-0.5 line-clamp-2 break-words text-xs text-slate-500">{item.teks.trim() || 'Opsi belum diisi'}</span>
                                    </span>
                                    <input ref={index === 0 ? multipleAnswerInput : undefined} type="checkbox" aria-label={'Opsi ' + String.fromCharCode(65 + index) + ' sebagai jawaban benar'} checked={item.benar} className="size-5 shrink-0 accent-blue-600"
                                        onChange={event => updateItem(item.editorKey, { benar: event.target.checked })} />
                                </label>)}
                            </div>
                            <p className={'text-xs font-medium ' + (items.filter(item => item.benar).length >= 2 ? 'text-blue-700' : 'text-slate-500')} role="status">
                                {items.filter(item => item.benar).length} jawaban benar dipilih · minimal 2
                            </p>
                        </div>}
                        {type === 'BS' && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <table className="w-full table-fixed text-left text-sm">
                                <thead className="border-b border-slate-200 bg-slate-100/70 text-xs text-slate-600">
                                    <tr><th scope="col" className="px-3 py-3 font-semibold">Pernyataan</th><th scope="col" className="w-16 py-3 text-center font-semibold sm:w-20">Benar</th><th scope="col" className="w-16 py-3 text-center font-semibold sm:w-20">Salah</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.map((item, index) => <tr key={item.editorKey}>
                                        <th scope="row" className="px-3 py-3 font-normal">
                                            <span className="block text-xs font-semibold text-slate-700">Pernyataan {index + 1}</span>
                                            <span className="mt-1 block line-clamp-2 break-words text-xs text-slate-500">{item.teks.trim() || 'Pernyataan belum diisi'}</span>
                                        </th>
                                        {[true, false].map(correct => <td key={String(correct)} className="p-1 text-center">
                                            <label className={'flex min-h-11 cursor-pointer items-center justify-center rounded-lg transition-colors focus-within:ring-2 focus-within:ring-blue-600 ' + (assignedStatements.has(item.editorKey) && item.benar === correct ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                                                <input type="radio" required name={answerId + '-statement-' + item.editorKey}
                                                    aria-label={'Pernyataan ' + (index + 1) + ': ' + (correct ? 'Benar' : 'Salah')}
                                                    checked={assignedStatements.has(item.editorKey) && item.benar === correct} className="size-5 accent-blue-600"
                                                    onChange={() => {
                                                        updateItem(item.editorKey, { benar: correct });
                                                        setAssignedStatements(current => new Set(current).add(item.editorKey));
                                                    }} />
                                            </label>
                                        </td>)}
                                    </tr>)}
                                </tbody>
                            </table>
                        </div>}
                        </section>
                    </fieldset>
                )}
                {type === 'ISIAN' && (
                    <section aria-labelledby={answerId + '-short-title'} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-blue-700"><KeyRound size={18} aria-hidden="true" /></span>
                            <div>
                                <h3 id={answerId + '-short-title'} className="text-sm font-semibold text-slate-900">Kunci jawaban</h3>
                                <p className="mt-1 text-xs leading-relaxed text-slate-500">Isi jawaban utama. Tambahkan alternatif jika ada jawaban lain yang juga benar.</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {answers.map((answer, index) => <div key={answer.key} className="flex items-end gap-2">
                                <label className="ui-label block min-w-0 flex-1" htmlFor={answerId + '-answer-' + answer.key}>
                                    {index === 0 ? 'Jawaban utama' : 'Alternatif jawaban ' + index}
                                    <input id={answerId + '-answer-' + answer.key} type="text" className={fieldClass} required maxLength={12000} value={answer.value}
                                        onChange={event => setAnswers(current => current.map(entry => entry.key === answer.key ? { ...entry, value: event.target.value } : entry))} />
                                </label>
                                <button type="button" disabled={answers.length <= 1} aria-label={'Hapus jawaban ' + (index + 1)} title="Hapus jawaban"
                                    className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                                    onClick={() => setAnswers(current => current.filter(entry => entry.key !== answer.key))}>
                                    <Trash2 size={17} aria-hidden="true" />
                                </button>
                            </div>)}
                        </div>
                        <button type="button" className={addRowClass} onClick={() => {
                            const key = nextAnswerKey.current++;
                            setAnswers(current => [...current, { key, value: '' }]);
                            requestAnimationFrame(() => document.getElementById(answerId + '-answer-' + key)?.focus());
                        }}><Plus size={18} aria-hidden="true" /> Tambah Alternatif Jawaban</button>
                    </section>
                )}
                {type === 'ESSAY' && (
                        <label className="ui-label block">Poin maksimum
                            <input className={fieldClass} type="number" min="1" max="100" step="1" required value={points} onChange={e => setPoints(Number(e.target.value))} />
                        </label>
                )}
            </div>
        </section>
    );
}

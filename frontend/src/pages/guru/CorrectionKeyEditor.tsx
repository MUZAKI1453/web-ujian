import { useEffect, useId, useRef, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import Select from '../../components/ui/Select';
import { fieldClass } from '../../components/ui/styles';
import QuestionContent from './QuestionContent';
import type { Question } from './QuestionEditor';
import MatchingBoard from '../../components/MatchingBoard';

export default function CorrectionKeyEditor({ question, append, onChange }: {
    question: Question; append: boolean; onChange: () => void;
}) {
    const id = useId();
    const [keys, setKeys] = useState(() => question.isi?.items?.map(item => item.benar) ?? []);
    const [answers, setAnswers] = useState(() => (append ? [''] : question.isi?.jawaban?.length ? question.isi.jawaban : ['']).map((value, key) => ({ value, key })));
    const nextKey = useRef(answers.length);
    const firstCheckbox = useRef<HTMLInputElement>(null);
    const items = question.isi?.items ?? [];
    const pairs = question.isi?.pasangan ?? [];
    const [pairKeys, setPairKeys] = useState(() => question.isi?.kunci ?? pairs.map((_, index) => index));
    useEffect(() => {
        firstCheckbox.current?.setCustomValidity(keys.some(Boolean) ? '' : 'Pilih minimal satu jawaban benar.');
    }, [keys]);
    function updateKey(index: number, value: boolean) {
        setKeys(current => current.map((entry, i) => i === index ? value : entry));
        onChange();
    }
    return <section aria-labelledby={id + '-title'} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-blue-100 bg-white text-blue-700"><KeyRound size={18} aria-hidden="true" /></span>
            <h4 id={id + '-title'} className="text-sm font-semibold text-slate-900">{append ? 'Alternatif jawaban' : 'Kunci jawaban'}</h4>
        </div>
        {keys.map((value, index) => <input key={index} type="hidden" name={'item-' + index} value={String(value)} />)}
        {question.tipeSoal === 'PG' && <label className="ui-label block">Jawaban benar
            <Select required className={fieldClass} value={keys.findIndex(Boolean) < 0 ? '' : keys.findIndex(Boolean)} onValueChange={value => {
                setKeys(current => current.map((_, index) => index === Number(value)));
                onChange();
            }}>
                <option value="" disabled>Pilih jawaban yang benar</option>
                {items.map((item, index) => <option key={index} value={index}>{'Opsi ' + String.fromCharCode(65 + index) + ' · ' + item.teks.slice(0, 80)}</option>)}
            </Select>
        </label>}
        {question.tipeSoal === 'PM' && <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">{items.map((item, index) => <label key={index}
                className={'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-blue-600 ' + (keys[index] ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-400')}>
                <span className={'grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold ' + (keys[index] ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600')} aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{'Opsi ' + String.fromCharCode(65 + index)}</span><span className="mt-0.5 block line-clamp-2 break-words text-xs text-slate-500">{item.teks}</span></span>
                <input ref={index === 0 ? firstCheckbox : undefined} type="checkbox" className="size-5 shrink-0 accent-blue-600" checked={keys[index]}
                    aria-label={'Opsi ' + String.fromCharCode(65 + index) + ' sebagai jawaban benar'} onChange={event => updateKey(index, event.target.checked)} />
            </label>)}</div>
            <p role="status" className="text-xs text-slate-500">{keys.filter(Boolean).length} jawaban benar dipilih · minimal 1</p>
        </div>}
        {question.tipeSoal === 'BS' && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b bg-slate-100/70 text-xs text-slate-600"><tr>
                    <th scope="col" className="px-3 py-3">Pernyataan</th><th scope="col" className="w-16 text-center sm:w-20">Benar</th><th scope="col" className="w-16 text-center sm:w-20">Salah</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{items.map((item, index) => <tr key={index}>
                    <th scope="row" className="px-3 py-3 text-xs font-normal"><span className="mb-1 block font-semibold">Pernyataan {index + 1}</span><QuestionContent text={item.teks} image={item.gambar} /></th>
                    {[true, false].map(value => <td key={String(value)} className="p-1 text-center">
                        <label className={'flex min-h-11 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-blue-600 ' + (keys[index] === value ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                            <input type="radio" required name={id + '-statement-' + index} checked={keys[index] === value} className="size-5 accent-blue-600"
                                aria-label={'Pernyataan ' + (index + 1) + ': ' + (value ? 'Benar' : 'Salah')} onChange={() => updateKey(index, value)} />
                        </label>
                    </td>)}
                </tr>)}</tbody>
            </table>
        </div>}
        {question.tipeSoal === 'JODOH' && <div className="space-y-3">
            {pairKeys.map((key, index) => <input type="hidden" key={index} name={'pasangan-' + index} value={key} />)}
            <MatchingBoard left={pairs.map(pair => pair.kiri)} right={pairs.map(pair => pair.kanan)} value={pairKeys}
                description="Tarik titik dari kiri ke kanan, atau ketuk kedua kartu. Memilih jawaban yang sudah terpakai akan menukar kedua pasangan."
                onConnect={(source, option) => {
                    setPairKeys(current => current.map((key, row) => {
                        if (row === source) return option;
                        return key === option ? current[source] : key;
                    }));
                    onChange();
                }} />
        </div>}
        {question.tipeSoal === 'ISIAN' && <div className="space-y-3">
            {answers.map((answer, index) => <div key={answer.key} className="flex items-end gap-2">
                <label className="ui-label min-w-0 flex-1">{index === 0 && !append ? 'Jawaban utama' : 'Alternatif jawaban ' + (append ? index + 1 : index)}
                    <input id={id + '-answer-' + answer.key} name="jawaban" required className={fieldClass} maxLength={12000} value={answer.value} onChange={event => {
                        setAnswers(current => current.map(entry => entry.key === answer.key ? { ...entry, value: event.target.value } : entry)); onChange();
                    }} />
                </label>
                <button type="button" aria-label={'Hapus jawaban ' + (index + 1)} title="Hapus jawaban" disabled={answers.length <= 1}
                    className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                    onClick={() => { setAnswers(current => current.filter(entry => entry.key !== answer.key)); onChange(); }}><Trash2 size={17} aria-hidden="true" /></button>
            </div>)}
            <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={() => {
                const key = nextKey.current++; setAnswers(current => [...current, { key, value: '' }]); onChange();
                requestAnimationFrame(() => document.getElementById(id + '-answer-' + key)?.focus());
            }}><Plus size={18} aria-hidden="true" />Tambah Alternatif Jawaban</button>
        </div>}
    </section>;
}

import { FormEvent, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../../services/api';
import QuestionContent from './QuestionContent';

const types = ['PG', 'PM', 'BS', 'ISIAN', 'ESSAY'] as const;
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

export const fieldClass = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';
export const primaryClass = 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
export function errorMessage(error: unknown) {
    return isAxiosError(error) ? error.response?.data?.message || 'Permintaan gagal. Coba lagi.' : 'Permintaan gagal. Coba lagi.';
}

function emptyItems(type: QuestionType): Item[] {
    return Array.from({ length: type === 'BS' ? 1 : 2 }, () => ({ teks: '', benar: false }));
}

export default function QuestionEditor({ examId, question, onClose, onSave }: {
    examId: number; question: Question | null; onClose: () => void; onSave: (question: Question) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [type, setType] = useState<QuestionType>(question?.tipeSoal ?? 'PG');
    const [text, setText] = useState(question?.pertanyaan ?? '');
    const [image, setImage] = useState(question?.isi?.gambar ?? '');
    const [items, setItems] = useState(question?.isi?.items ?? emptyItems(type));
    const [answers, setAnswers] = useState(question?.isi?.jawaban?.join('\n') ?? '');
    const [numeric, setNumeric] = useState(question?.isi?.angka ?? false);
    const [rubric, setRubric] = useState(question?.isi?.pedoman ?? '');
    const [points, setPoints] = useState(question?.tipeSoal === 'ESSAY' ? Number(question.bobot) : 1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { dialog.current?.showModal(); }, []);
    const updateItem = (index: number, values: Partial<Item>) => {
        setItems(current => current.map((item, i) => i === index ? { ...item, ...values } : item));
    };

    function readImage(file: File | undefined, apply: (value: string) => void) {
        if (!file) return;
        setError('');
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 512 * 1024) {
            setError('Pilih gambar PNG, JPG, WebP, atau GIF maksimal 512 KB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => apply(String(reader.result));
        reader.onerror = () => setError('Gambar gagal dibaca.');
        reader.readAsDataURL(file);
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        const url = '/guru/ujian/' + examId + '/soal';
        const payload = { tipeSoal: type, pertanyaan: text, gambar: image, items, jawaban: answers.split('\n'), angka: numeric, pedoman: rubric, poin: points };
        try {
            const { data } = question ? await api.put<Question>(url + '/' + question.id, payload) : await api.post<Question>(url, payload);
            onSave(data);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <dialog ref={dialog} aria-labelledby="editor-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
            className="max-h-[90vh] w-[min(92vw,48rem)] rounded-2xl p-5 backdrop:bg-slate-900/60 sm:p-7">
            <h2 id="editor-title" className="text-xl font-bold">{question ? 'Edit Soal' : 'Tambah Soal'}</h2>
            <form onSubmit={submit} className="mt-4 space-y-4">
                <label className="block text-sm font-semibold">Tipe soal
                    <select className={fieldClass} value={type} onChange={event => {
                        const next = event.target.value as QuestionType;
                        setType(next);
                        setItems(emptyItems(next));
                    }}>
                        {types.map(value => <option key={value}>{value}</option>)}
                    </select>
                </label>
                <label className="block text-sm font-semibold">Soal
                    <textarea className={fieldClass} required maxLength={12000} rows={3} value={text} onChange={e => setText(e.target.value)} />
                </label>
                <label className="block text-sm font-semibold">URL gambar soal (opsional)
                    <input type="url" className={fieldClass} maxLength={2000} value={image.startsWith('data:') ? '' : image} onChange={e => setImage(e.target.value)} />
                </label>
                <label className="block text-sm">Atau unggah gambar soal
                    <input className={fieldClass} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={e => readImage(e.target.files?.[0], setImage)} />
                </label>
                {image && <button type="button" className="text-sm text-red-700" onClick={() => setImage('')}>Hapus gambar soal</button>}
                {(text || image) && <div className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm">
                    <QuestionContent text={text} image={image} />
                </div>}
                {(type === 'PG' || type === 'PM' || type === 'BS') && (
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold">{type === 'BS' ? 'Pernyataan dan kunci' : 'Opsi dan kunci'}</legend>
                        {items.map((item, index) => (
                            <div key={index} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                <input aria-label={(type === 'BS' ? 'Pernyataan ' : 'Opsi ') + (index + 1)}
                                    required maxLength={12000} className={fieldClass} value={item.teks} onChange={e => updateItem(index, { teks: e.target.value })} />
                                {type === 'BS' ? (
                                    <select aria-label={'Kunci pernyataan ' + (index + 1)} value={String(item.benar)}
                                        onChange={e => updateItem(index, { benar: e.target.value === 'true' })}>
                                        <option value="true">Benar</option><option value="false">Salah</option>
                                    </select>
                                ) : (
                                    <label className="flex items-center gap-1 text-sm">
                                        <input type={type === 'PG' ? 'radio' : 'checkbox'} name={type === 'PG' ? 'kunci' : undefined}
                                            checked={item.benar} onChange={e => {
                                                if (type === 'PG') setItems(current => current.map((entry, i) => ({ ...entry, benar: i === index })));
                                                else updateItem(index, { benar: e.target.checked });
                                            }} /> Kunci
                                    </label>
                                )}
                                <button type="button" aria-label={'Hapus baris ' + (index + 1)} disabled={items.length <= (type === 'BS' ? 1 : 2)}
                                    className="rounded px-2 py-1 text-red-700 disabled:opacity-30"
                                    onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Hapus</button>
                                <label className="col-span-full text-xs text-slate-600">URL gambar baris {index + 1} (opsional)
                                    <input type="url" className={fieldClass} maxLength={2000} value={item.gambar?.startsWith('data:') ? '' : item.gambar ?? ''}
                                        onChange={e => updateItem(index, { gambar: e.target.value })} />
                                </label>
                                <label className="col-span-full text-xs">Atau unggah gambar baris {index + 1}
                                    <input className={fieldClass} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                                        onChange={e => readImage(e.target.files?.[0], gambar => updateItem(index, { gambar }))} />
                                </label>
                                {item.gambar && <div className="col-span-full">
                                    <QuestionContent text="" image={item.gambar} />
                                    <button type="button" className="text-xs text-red-700" onClick={() => updateItem(index, { gambar: '' })}>Hapus gambar baris</button>
                                </div>}
                            </div>
                        ))}
                        <button type="button" className="text-sm font-semibold text-blue-700"
                            onClick={() => setItems(current => [...current, { teks: '', benar: false }])}>
                            {type === 'BS' ? '+ Tambah pernyataan' : '+ Tambah opsi'}
                        </button>
                    </fieldset>
                )}
                {type === 'ISIAN' && (
                    <>
                        <label className="block text-sm font-semibold">Jawaban diterima (satu per baris)
                            <textarea className={fieldClass} required rows={3} value={answers} onChange={e => setAnswers(e.target.value)} />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={numeric} onChange={e => setNumeric(e.target.checked)} /> Isian angka
                        </label>
                    </>
                )}
                {type === 'ESSAY' && (
                    <>
                        <label className="block text-sm font-semibold">Pedoman penilaian (opsional)
                            <textarea className={fieldClass} rows={3} value={rubric} onChange={e => setRubric(e.target.value)} />
                        </label>
                        <label className="block text-sm font-semibold">Poin maksimum
                            <input className={fieldClass} type="number" min="1" max="100" step="1" required value={points} onChange={e => setPoints(Number(e.target.value))} />
                        </label>
                    </>
                )}
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                <div className="flex justify-end gap-3 border-t pt-3">
                    <button type="button" disabled={saving} className="rounded-xl border px-4 py-2 text-sm" onClick={onClose}>Batal</button>
                    <button type="submit" disabled={saving} className={primaryClass}>{saving ? 'Menyimpan…' : 'Simpan Soal'}</button>
                </div>
            </form>
        </dialog>
    );
}

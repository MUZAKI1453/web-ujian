import Select from '../../components/ui/Select';
import { useId, useState } from 'react';
import { isAxiosError } from 'axios';
import QuestionContent from './QuestionContent';
import { fieldClass } from '../../components/ui/styles';
export { fieldClass, primaryClass } from '../../components/ui/styles';

const types = ['PG', 'PM', 'BS', 'ISIAN', 'ESSAY'] as const;
const typeLabels = { PG: 'Pilihan Ganda', PM: 'Pilihan Majemuk', BS: 'Benar / Salah', ISIAN: 'Isian Singkat', ESSAY: 'Essay' };
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

function initialQuestion(question: Question | null) {
    const tipeSoal = question?.tipeSoal ?? 'PG';
    return {
        tipeSoal, pertanyaan: question?.pertanyaan ?? '', gambar: question?.isi?.gambar ?? '',
        items: question?.isi?.items ?? emptyItems(tipeSoal), jawaban: question?.isi?.jawaban ?? [''],
        angka: question?.isi?.angka ?? false, pedoman: question?.isi?.pedoman ?? '',
        poin: question?.tipeSoal === 'ESSAY' ? Number(question.bobot) : 1
    };
}

export default function QuestionEditor({ question, number, onRemove, focus }: {
    question: Question | null; number: number; onRemove: () => void; focus?: boolean;
}) {
    const answerGroup = useId();
    const [initial] = useState(() => initialQuestion(question));
    const [type, setType] = useState(initial.tipeSoal);
    const [text, setText] = useState(initial.pertanyaan);
    const [image, setImage] = useState(initial.gambar);
    const [items, setItems] = useState(initial.items);
    const [answers, setAnswers] = useState(initial.jawaban.join('\n'));
    const [numeric, setNumeric] = useState(initial.angka);
    const [rubric, setRubric] = useState(initial.pedoman);
    const [points, setPoints] = useState(initial.poin);
    const [reading, setReading] = useState(0);
    const [error, setError] = useState('');

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
        reader.onloadend = () => setReading(current => current - 1);
        setReading(current => current + 1);
        reader.readAsDataURL(file);
    }

    const soal = { tipeSoal: type, pertanyaan: text, gambar: image, items, jawaban: answers.split('\n'), angka: numeric, pedoman: rubric, poin: points };
    const changed = !question || JSON.stringify(soal) !== JSON.stringify(initial);

    return (
        <section className="ui-card overflow-hidden border bg-white">
            <div className={'flex items-center justify-between gap-2 px-5 py-4 ' + (type === 'ESSAY' ? 'bg-amber-100 text-amber-950' : 'bg-blue-600 text-white')}>
                <h2 className="flex flex-wrap items-center gap-2 font-bold"><span className="grid size-8 place-items-center rounded-full bg-white/20 text-sm">{number}</span> Soal {number}<span className="text-xs font-normal opacity-80">· {typeLabels[type]}</span></h2>
                <button type="button" className="ui-button ui-button-secondary shrink-0 border border-current/20 text-xs" onClick={onRemove}>Hapus Soal</button>
            </div>
            {question && <input type="hidden" name="soalAktif" value={question.id} />}
            {changed && <input type="hidden" name="perubahan" value={JSON.stringify({ id: question?.id ?? null, nomor: number, soal })} />}
            {reading > 0 && <input type="hidden" name="gambarDiproses" value="1" />}
            <div className="space-y-4 p-5">
                <label className="ui-label block">Tipe soal
                    <Select className={fieldClass} value={type} onValueChange={event => {
                        const next = event as QuestionType;
                        setType(next);
                        setItems(emptyItems(next));
                    }}>
                        {types.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}
                    </Select>
                </label>
                <label className="ui-label block">Soal
                    <textarea className={fieldClass} autoFocus={focus} required maxLength={12000} rows={3} value={text} onChange={e => setText(e.target.value)} />
                </label>
                <label className="ui-label block">URL gambar soal (opsional)
                    <input type="url" className={fieldClass} maxLength={2000} value={image.startsWith('data:') ? '' : image} onChange={e => setImage(e.target.value)} />
                </label>
                <label className="ui-label block">Atau unggah gambar soal
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
                            <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <input aria-label={(type === 'BS' ? 'Pernyataan ' : 'Opsi ') + (index + 1)}
                                    required maxLength={12000} className={fieldClass} value={item.teks} onChange={e => updateItem(index, { teks: e.target.value })} />
                                {type === 'BS' ? (
                                    <Select aria-label={'Kunci pernyataan ' + (index + 1)} value={String(item.benar)}
                                        onValueChange={e => updateItem(index, { benar: e === 'true' })}>
                                        <option value="true">Benar</option><option value="false">Salah</option>
                                    </Select>
                                ) : (
                                    <label className="flex items-center gap-1 text-sm">
                                        <input type={type === 'PG' ? 'radio' : 'checkbox'} name={type === 'PG' ? 'kunci-' + answerGroup : undefined}
                                            checked={item.benar} onChange={e => {
                                                if (type === 'PG') setItems(current => current.map((entry, i) => ({ ...entry, benar: i === index })));
                                                else updateItem(index, { benar: e.target.checked });
                                            }} /> Kunci
                                    </label>
                                )}
                                <button type="button" aria-label={'Hapus baris ' + (index + 1)} disabled={items.length <= (type === 'BS' ? 1 : 2)}
                                    className="rounded px-2 py-1 text-red-700 disabled:opacity-30"
                                    onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Hapus</button>
                                <label className="ui-label col-span-full">URL gambar baris {index + 1} (opsional)
                                    <input type="url" className={fieldClass} maxLength={2000} value={item.gambar?.startsWith('data:') ? '' : item.gambar ?? ''}
                                        onChange={e => updateItem(index, { gambar: e.target.value })} />
                                </label>
                                <label className="ui-label col-span-full">Atau unggah gambar baris {index + 1}
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
                        <label className="ui-label block">Jawaban diterima (satu per baris)
                            <textarea className={fieldClass} required rows={3} value={answers} onChange={e => setAnswers(e.target.value)} />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={numeric} onChange={e => setNumeric(e.target.checked)} /> Isian angka
                        </label>
                    </>
                )}
                {type === 'ESSAY' && (
                    <>
                        <label className="ui-label block">Pedoman penilaian (opsional)
                            <textarea className={fieldClass} rows={3} value={rubric} onChange={e => setRubric(e.target.value)} />
                        </label>
                        <label className="ui-label block">Poin maksimum
                            <input className={fieldClass} type="number" min="1" max="100" step="1" required value={points} onChange={e => setPoints(Number(e.target.value))} />
                        </label>
                    </>
                )}
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            </div>
        </section>
    );
}

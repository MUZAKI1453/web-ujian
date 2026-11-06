import { fieldClass, primaryClass } from '../../components/ui/styles';
import { useRef, useState, type FormEvent } from 'react';
import api from '../../services/api';
import QuestionEditor, { errorMessage, type Question } from './QuestionEditor';
import type { ExamDetail } from './UjianGuru';
import { examClassNames } from './UjianGuru';
import { questionTypeLabels } from './questionTypes';
import { Plus } from 'lucide-react';

type QuestionType = Question['tipeSoal'];
const questionTypes = Object.keys(questionTypeLabels) as QuestionType[];

function localDateTime(value: string) {
    const date = new Date(value);
    return new Date(+date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export default function EditUjian({ exam, focusId, onCancel, onSave }: {
    exam: ExamDetail; focusId?: number; onCancel: () => void; onSave: (exam: ExamDetail) => void;
}) {
    const nextKey = useRef(-1);
    const formRef = useRef<HTMLFormElement>(null);
    const [activeType, setActiveType] = useState<QuestionType>(() => exam.soal.find(question => question.id === focusId)?.tipeSoal ?? exam.soal[0]?.tipeSoal ?? 'PG');
    const [rows, setRows] = useState(() => {
        const existing = exam.soal.map(question => ({ key: question.id, question: question as Question | null, type: question.tipeSoal }));
        return existing;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    function addQuestion() {
        const key = nextKey.current--;
        setRows(current => [...current, { key, question: null, type: activeType }]);
        requestAnimationFrame(() => {
            const editor = formRef.current?.querySelector<HTMLElement>('[data-editor-key="' + key + '"]');
            editor?.scrollIntoView({ block: 'start' });
            editor?.querySelector('textarea')?.focus({ preventScroll: true });
        });
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;
        const invalid = Array.from(event.currentTarget.elements).find((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
            (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && element.willValidate && !element.validity.valid);
        if (invalid) {
            const type = invalid.closest<HTMLElement>('[data-question-type]')?.dataset.questionType as QuestionType | undefined;
            if (type) setActiveType(type);
            requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
            return;
        }
        const form = new FormData(event.currentTarget);
        const changes = form.getAll('perubahan');
        const currentIds = new Set(form.getAll('soalAktif').map(Number));
        const initialIds = exam.soal.map(question => question.id);
        setError('');
        if (form.has('gambarDiproses')) {
            setError('Tunggu sampai gambar selesai dibaca, lalu simpan kembali.');
            return;
        }
        if (changes.length > 500) {
            setError('Maksimal 500 soal baru atau diubah dalam sekali simpan.');
            return;
        }

        const start = new Date(String(form.get('mulai')));
        const end = new Date(String(form.get('selesai')));
        if (!Number.isFinite(+start) || !Number.isFinite(+end)) {
            setError('Periksa waktu mulai dan selesai ujian.');
            return;
        }
        const payload = JSON.stringify({
            judul: form.get('judul'),
            durasiMenit: Number(form.get('durasi')),
            waktuMulai: start.toISOString(),
            waktuSelesai: end.toISOString(),
            soalAwal: initialIds,
            hapus: initialIds.filter(id => !currentIds.has(id)),
            perubahan: changes.map(change => JSON.parse(String(change)))
        });
        if (new Blob([payload]).size > 8 * 1024 * 1024) {
            setError('Ukuran perubahan melebihi 8 MB. Kurangi ukuran gambar atau simpan soal bergantian.');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.put<ExamDetail>('/guru/ujian/' + exam.id + '/draf', payload);
            onSave(data);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <form ref={formRef} onSubmit={save} noValidate className="cbt-portal">
            <fieldset disabled={saving} className="space-y-5">
                <header className="ui-card flex flex-wrap items-center justify-between gap-3 border bg-white p-5">
                    <div>
                        <p className="mb-1 text-sm font-semibold text-blue-600">Edit Soal & Ujian</p>
                        <h1 className="ui-page-title">{exam.judul}</h1>
                        <p className="text-sm text-slate-600">{exam.mapel.nama} · {examClassNames(exam)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="ui-button ui-button-secondary border" onClick={onCancel}>Batal</button>
                    </div>
                </header>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <section className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2">
                    <h2 className="cbt-section-title sm:col-span-2">Pengaturan Umum</h2>
                    <label className="ui-label">Judul ujian
                        <input name="judul" required maxLength={150} defaultValue={exam.judul} className={fieldClass} />
                    </label>
                    <label className="ui-label">Durasi (menit)
                        <input name="durasi" type="number" required min={1} defaultValue={exam.durasiMenit} className={fieldClass} />
                    </label>
                    <label className="ui-label">Waktu mulai
                        <input name="mulai" type="datetime-local" step="1" required defaultValue={localDateTime(exam.waktuMulai)} className={fieldClass} />
                    </label>
                    <label className="ui-label">Waktu selesai
                        <input name="selesai" type="datetime-local" step="1" required defaultValue={localDateTime(exam.waktuSelesai)} className={fieldClass} />
                    </label>
                </section>
                <nav aria-label="Tipe soal" className="grid grid-cols-2 gap-2 rounded-xl border bg-white p-2 lg:grid-cols-5">
                    {questionTypes.map(type => <button key={type} type="button" aria-pressed={activeType === type}
                        className={'flex items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm font-semibold transition-colors ' + (activeType === type ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100')}
                        onClick={() => setActiveType(type)}>
                        {questionTypeLabels[type]}
                        <span className={'rounded-full px-2 py-0.5 text-xs ' + (activeType === type ? 'bg-white/20' : 'bg-slate-100')}>{rows.filter(row => row.type === type).length}</span>
                    </button>)}
                </nav>
                {!rows.some(row => row.type === activeType) && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    Belum ada soal {questionTypeLabels[activeType]}. Gunakan tombol Tambah Soal untuk mulai mengisi.
                </div>}
                {rows.map((row, index) => (
                    <div key={row.key} hidden={row.type !== activeType} data-question-type={row.type} data-editor-key={row.key} className="scroll-mt-6">
                        <QuestionEditor number={index + 1} question={row.question} defaultType={row.type} focus={row.key === focusId}
                            onRemove={() => setRows(current => current.filter(item => item.key !== row.key))} />
                    </div>
                ))}
                <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                    <button type="button" className="ui-button ui-button-secondary border" onClick={addQuestion}>
                        <Plus size={18} aria-hidden="true" /> Tambah Soal
                    </button>
                    <button type="submit" className={primaryClass}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button>
                </div>
            </fieldset>
        </form>
    );
}

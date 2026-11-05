import { fieldClass, primaryClass } from '../../components/ui/styles';
import { useRef, useState, type FormEvent } from 'react';
import api from '../../services/api';
import QuestionEditor, { errorMessage, type Question } from './QuestionEditor';
import type { ExamDetail } from './UjianGuru';
import { examClassNames } from './UjianGuru';

function localDateTime(value: string) {
    const date = new Date(value);
    return new Date(+date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export default function EditUjian({ exam, focusId, onCancel, onSave }: {
    exam: ExamDetail; focusId?: number; onCancel: () => void; onSave: (exam: ExamDetail) => void;
}) {
    const nextKey = useRef(-1);
    const [rows, setRows] = useState(() => {
        const existing = exam.soal.map(question => ({ key: question.id, question: question as Question | null }));
        return existing.length ? existing : [{ key: 0, question: null }];
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;
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
        <form onSubmit={save} className="cbt-portal pb-20 sm:pb-0">
            <fieldset disabled={saving} className="space-y-5">
                <header className="ui-card flex flex-wrap items-center justify-between gap-3 border bg-white p-5">
                    <div>
                        <p className="mb-1 text-sm font-semibold text-blue-600">Edit Soal & Ujian</p>
                        <h1 className="ui-page-title">{exam.judul}</h1>
                        <p className="text-sm text-slate-600">{exam.mapel.nama} · {examClassNames(exam)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="ui-button ui-button-secondary border" onClick={onCancel}>Batal</button>
                        <button type="submit" className={primaryClass}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button>
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
                {rows.map((row, index) => (
                    <QuestionEditor key={row.key} number={index + 1} question={row.question} focus={row.key === focusId}
                        onRemove={() => setRows(current => current.filter(item => item.key !== row.key))} />
                ))}
                <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap justify-between gap-2 border-t bg-white p-3 shadow-lg sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                    <button type="button" className="ui-button ui-button-secondary border bg-white" onClick={() => {
                        const key = nextKey.current--;
                        setRows(current => [...current, { key, question: null }]);
                    }}>Tambah Soal</button>
                    <button type="submit" className={primaryClass}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button>
                </div>
                {error && <p className="text-sm text-red-700">{error}</p>}
            </fieldset>
        </form>
    );
}

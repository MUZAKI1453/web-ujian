import { fieldClass, primaryClass } from '../../components/ui/styles';
import { FormEvent, useState } from 'react';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';

export default function ImportSoal({ examId, onClose, onImport }: {
    examId: number; onClose: () => void; onImport: (questions: Question[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');

    async function download() {
        setError('');
        setDownloading(true);
        try {
            const { data } = await api.get<Blob>('/guru/soal/template', { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'template-soal.xlsx';
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            setError('Gagal mengunduh template. Coba lagi.');
        } finally {
            setDownloading(false);
        }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError('');
        setSaving(true);
        try {
            const response = await api.post<{ soal: Question[] }>('/guru/ujian/' + examId + '/soal/import', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onImport(response.data.soal);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <section aria-labelledby="import-soal-title" className="ui-card max-w-2xl border bg-white p-5 sm:p-7">
            <h2 id="import-soal-title" className="text-xl font-bold">Impor Soal Excel</h2>
            <p className="mt-2 text-sm text-slate-600">
                Template memuat contoh PG, PM, BS, ISIAN, dan ESSAY. Ganti isinya dengan soal Anda.
                Mulai setiap blok dengan baris <strong>tipe</strong>, lalu tulis <strong>soal</strong> dan bagian lainnya di bawahnya.
            </p>
            <button type="button" disabled={downloading || saving} onClick={() => void download()}
                className="ui-button ui-button-secondary my-4 border">
                {downloading ? 'Mengunduh…' : 'Unduh Template Excel'}
            </button>
            <form onSubmit={submit} className="space-y-3">
                <label className="ui-label block">File Excel (maksimal 5 MB)
                    <input type="file" name="file" accept=".xlsx,.xls" required disabled={saving} className={fieldClass} />
                </label>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <div className="flex justify-end gap-3 border-t pt-3">
                    <button type="button" disabled={saving} className="ui-button ui-button-secondary border" onClick={onClose}>Batal</button>
                    <button type="submit" disabled={saving} className={primaryClass}>{saving ? 'Mengimpor…' : 'Impor Soal'}</button>
                </div>
            </form>
        </section>
    );
}

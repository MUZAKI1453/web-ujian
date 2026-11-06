import { fieldClass, primaryClass } from '../../components/ui/styles';
import { FormEvent, useState } from 'react';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import ModalOverlay from '../../components/ModalOverlay';
import { Download, UploadCloud, X } from 'lucide-react';

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
        <ModalOverlay label="Impor Soal Excel" onClose={() => { if (!saving && !downloading) onClose(); }}>
        <section aria-labelledby="import-soal-title" className="ui-dialog-panel max-w-xl">
            <div className="flex items-center justify-between gap-3">
                <h2 id="import-soal-title" className="flex items-center gap-2 text-lg font-bold"><UploadCloud size={22} className="text-blue-600" aria-hidden="true" />Impor Soal Excel</h2>
                <button type="button" disabled={saving || downloading} aria-label="Tutup impor soal" title="Tutup"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40" onClick={onClose}><X size={18} aria-hidden="true" /></button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
                Gunakan template lima tipe soal. Isi mulai baris 12 dan kosongkan sheet yang tidak digunakan.
            </p>
            <button type="button" disabled={downloading || saving} onClick={() => void download()}
                className="ui-button ui-button-secondary my-4 w-full border">
                <Download size={18} aria-hidden="true" />{downloading ? 'Mengunduh…' : 'Unduh Template Excel'}
            </button>
            <form onSubmit={submit} className="space-y-3">
                <label className="ui-label block">File Excel (maksimal 5 MB)
                    <input type="file" name="file" accept=".xlsx,.xls" required disabled={saving} className={fieldClass} />
                </label>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <div className="flex justify-end gap-3 border-t pt-3">
                    <button type="button" disabled={saving || downloading} className="ui-button ui-button-secondary border" onClick={onClose}>Batal</button>
                    <button type="submit" disabled={saving || downloading} className={primaryClass}>{saving ? 'Mengimpor…' : 'Impor Soal'}</button>
                </div>
            </form>
        </section>
        </ModalOverlay>
    );
}

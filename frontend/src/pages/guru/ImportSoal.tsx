import { fieldClass, primaryClass } from '../../components/ui/styles';
import { FormEvent, useState } from 'react';
import api from '../../services/api';
import { saveBlob } from '../../services/nativeApp';
import { errorMessage } from './QuestionEditor';
import type { Question } from './QuestionEditor';
import ModalOverlay from '../../components/ModalOverlay';
import { Download, UploadCloud, X } from 'lucide-react';
import { questionTypeLabels } from './questionTypes';

type ImportPreview = { jumlah: number; counts: Partial<Record<keyof typeof questionTypeLabels, number>> };

export default function ImportSoal({ examId, onClose, onImport }: {
    examId: number; onClose: () => void; onImport: (questions: Question[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);

    async function download() {
        setError('');
        setDownloading(true);
        try {
            const { data } = await api.get<Blob>('/guru/soal/template', { responseType: 'blob' });
            await saveBlob(data, 'template-soal.xlsx');
        } catch {
            setError('Gagal mengunduh template. Coba lagi.');
        } finally {
            setDownloading(false);
        }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving || downloading) return;
        const data = new FormData(event.currentTarget);
        const file = data.get('file');
        setError('');
        if (file instanceof File && file.size > 5 * 1024 * 1024) {
            setError('Ukuran file Excel maksimal 5 MB.');
            return;
        }
        setSaving(true);
        try {
            const url = '/guru/ujian/' + examId + '/soal/import';
            const headers = { 'Content-Type': 'multipart/form-data' };
            if (!preview) {
                const response = await api.post<ImportPreview>(url, data, { headers, params: { preview: '1' } });
                setPreview(response.data);
            } else {
                const response = await api.post<{ soal: Question[] }>(url, data, { headers });
                onImport(response.data.soal);
            }
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
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                <li>Unduh template dan buka sheet sesuai tipe soal.</li>
                <li>Isi satu soal per baris mulai baris 12. Gunakan dropdown kunci jika tersedia.</li>
                <li>Pilih file, klik Periksa File, lalu konfirmasi jumlah soal yang akan ditambahkan.</li>
            </ol>
            <button type="button" disabled={downloading || saving} onClick={() => void download()}
                className="ui-button ui-button-secondary my-4 w-full border">
                <Download size={18} aria-hidden="true" />{downloading ? 'Mengunduh…' : 'Unduh Template Excel'}
            </button>
            <form onSubmit={submit} className="space-y-3">
                <label className="ui-label block">File Excel (maksimal 5 MB)
                    <input type="file" name="file" accept=".xlsx,.xls" required disabled={saving} className={fieldClass} onChange={() => { setPreview(null); setError(''); }} />
                </label>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                {preview && <div role="status" className="ui-notice ui-notice-success">
                    <p className="font-semibold">{preview.jumlah} soal siap ditambahkan ke draf.</p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(preview.counts).map(([type, count]) => <li key={type}>{questionTypeLabels[type as keyof typeof questionTypeLabels]}: {count}</li>)}
                    </ul>
                </div>}
                <div className="flex flex-wrap justify-end gap-3 border-t pt-3">
                    <button type="button" disabled={saving || downloading} className="ui-button ui-button-secondary border" onClick={onClose}>Batal</button>
                    <button type="submit" disabled={saving || downloading} className={preview ? 'ui-button ui-button-success' : primaryClass}>
                        {preview ? saving ? 'Mengimpor…' : `Impor ${preview.jumlah} Soal` : saving ? 'Memeriksa…' : 'Periksa File'}
                    </button>
                </div>
            </form>
        </section>
        </ModalOverlay>
    );
}

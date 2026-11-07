import { useState, type FormEvent } from 'react';
import { Download, UploadCloud } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { downloadImportTemplate } from '../services/downloadImportTemplate';

export default function AccountImportDialog({ role, onClose, onSubmit, onFileChange }: {
    role: 'siswa' | 'guru'; onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void; onFileChange: (file: File | null) => void;
}) {
    const label = role === 'siswa' ? 'Siswa' : 'Guru';
    const [downloadError, setDownloadError] = useState('');
    const [downloading, setDownloading] = useState(false);

    async function download() {
        setDownloadError('');
        setDownloading(true);
        try { await downloadImportTemplate(role); }
        catch { setDownloadError('Gagal mengunduh template. Coba lagi.'); }
        finally { setDownloading(false); }
    }
    return <ModalOverlay label={'Import Data ' + label} onClose={onClose}>
        <section className="ui-dialog-panel max-w-lg space-y-5" aria-labelledby={'import-' + role + '-title'}>
            <h2 id={'import-' + role + '-title'} className="flex items-center gap-2 text-lg font-bold">
                <UploadCloud size={22} className="shrink-0 text-blue-600" aria-hidden="true" />Import Data {label}
            </h2>
            <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
                <h3 className="font-semibold text-blue-900">Panduan import</h3>
                <ul className="list-disc space-y-1 pl-5 leading-relaxed">
                    <li>Unduh template melalui tombol di bawah, lalu isi data sesuai kolom yang tersedia.</li>
                    <li>Pertahankan judul kolom di baris 11. Isi {role === 'siswa' ? 'NIS, nama lengkap, dan nama kelas' : 'NIP dan nama lengkap guru'} mulai baris 12.</li>
                    <li>Tulis {role === 'siswa' ? 'NIS' : 'NIP'} sebagai teks agar nol di depan tetap tersimpan.{role === 'siswa' ? ' Gunakan nama kelas yang sudah terdaftar.' : ''}</li>
                </ul>
            </div>
            <button type="button" disabled={downloading} onClick={() => void download()} className="ui-button ui-button-secondary w-full">
                <Download size={18} aria-hidden="true" />{downloading ? 'Mengunduh…' : `Unduh Template ${label}`}
            </button>
            {downloadError && <p role="alert" className="ui-notice ui-notice-error">{downloadError}</p>}
            <form onSubmit={onSubmit} className="space-y-4 border-t border-slate-100 pt-4">
                <label className="ui-label">Pilih file yang sudah diisi (.xlsx / .xls)
                    <input type="file" accept=".xlsx,.xls" required onChange={event => onFileChange(event.target.files?.[0] ?? null)}
                        className="ui-input mt-1 block w-full" />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={onClose} className="ui-button ui-button-secondary">Batal</button>
                    <button type="submit" className="ui-button ui-button-success">Mulai Import</button>
                </div>
            </form>
        </section>
    </ModalOverlay>;
}

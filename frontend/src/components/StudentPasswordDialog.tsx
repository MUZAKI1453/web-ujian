import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { KeyRound } from 'lucide-react';
import api from '../services/api';
import ModalOverlay from './ModalOverlay';

type Result = { password: string | null; adaSandi: boolean };

function message(error: unknown, fallback: string) {
    return isAxiosError(error) ? error.response?.data?.message || fallback : fallback;
}

// Menampilkan password siswa buatan sekolah dan, bila perlu, menggantinya. `path` adalah alamat API akun siswa itu:
// GET mengembalikan password, POST membuat password baru. Server yang menentukan siapa boleh membukanya.
export default function StudentPasswordDialog({ path, name, nis, onClose, onChanged }: {
    path: string; name: string; nis: string; onClose: () => void; onChanged?: () => void;
}) {
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [replaced, setReplaced] = useState(false);
    const submitting = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        api.get<Result>(path, { signal: controller.signal })
            .then(({ data }) => setResult(data))
            .catch(err => { if (!controller.signal.aborted) setError(message(err, 'Password gagal dimuat.')); });
        return () => controller.abort();
    }, [path]);

    async function replace() {
        if (submitting.current) return;
        submitting.current = true;
        setPending(true); setError('');
        try {
            const { data } = await api.post<Result>(path);
            setResult(data); setReplaced(true); setConfirming(false);
            onChanged?.();
        } catch (err) {
            setError(message(err, 'Password gagal diganti.'));
        } finally {
            submitting.current = false;
            setPending(false);
        }
    }

    return <ModalOverlay label="Password siswa" onClose={() => { if (!pending) onClose(); }}>
        <section className="ui-dialog-panel max-w-sm space-y-4">
            <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><KeyRound size={22} aria-hidden="true" /></span>
                <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-slate-900">{name}</h2>
                    <p className="text-sm text-slate-600">NIS {nis}</p>
                </div>
            </div>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {!result && !error && <p role="status" className="text-sm text-slate-500">Memuat password…</p>}
            {result && <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Password</p>
                {result.password
                    ? <p className="mt-1 select-all font-mono text-3xl font-bold tracking-[0.25em] text-slate-900">{result.password}</p>
                    : <p className="mt-1 text-sm text-slate-600">{result.adaSandi
                        ? 'Password tidak dapat ditampilkan. Buat password baru untuk siswa ini.'
                        : 'Siswa ini belum punya password dari sekolah dan masih memakai password lamanya.'}</p>}
            </div>}
            {replaced && <p role="status" className="ui-notice ui-notice-success">Password baru dibuat. Sesi lama siswa diakhiri; kartu atau daftar cetak lama untuk siswa ini tidak berlaku lagi.</p>}
            {confirming && <p className="ui-notice ui-notice-warning">Password lama dan kartu siswa ini tidak akan berlaku lagi, dan sesi yang sedang aktif diakhiri. Jawaban yang sudah tersimpan tidak hilang.</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                {confirming ? <>
                    <button type="button" disabled={pending} className="ui-button ui-button-secondary" onClick={() => setConfirming(false)}>Batal</button>
                    <button type="button" disabled={pending} className="ui-button ui-button-primary" onClick={() => void replace()}>{pending ? 'Membuat…' : 'Ya, buat password baru'}</button>
                </> : <>
                    {result && <button type="button" className="ui-button ui-button-secondary" onClick={() => { setReplaced(false); setConfirming(true); }}>
                        {result.password ? 'Ganti password' : 'Buat password'}</button>}
                    <button type="button" className="ui-button ui-button-primary" onClick={onClose}>Tutup</button>
                </>}
            </div>
        </section>
    </ModalOverlay>;
}

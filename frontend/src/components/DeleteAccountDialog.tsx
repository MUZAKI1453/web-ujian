import { useState } from 'react';
import api from '../services/api';

interface Props {
    role: 'siswa' | 'guru';
    ids: number[];
    onClose: () => void;
    onDeleted: () => void;
}

export default function DeleteAccountDialog({ role, ids, onClose, onDeleted }: Props) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');

    async function remove() {
        setPending(true);
        setError('');
        try {
            if (ids.length === 1) {
                await api.delete('/admin/' + role + '/' + ids[0]);
            } else {
                await api.post('/admin/' + role + '/hapus-terpilih', { ids });
            }
            onDeleted();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Gagal menghapus data ' + role + '.');
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title"
                className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-xl">
                <h3 id="delete-account-title" className="text-lg font-bold">Hapus {ids.length} akun {role}?</h3>
                {role === 'siswa' && <p>Riwayat pengerjaan dan jawaban ujian siswa terpilih juga akan terhapus.</p>}
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                <div className="flex justify-end gap-3">
                    <button type="button" autoFocus disabled={pending} onClick={onClose} className="rounded-xl px-4 py-2">Batal</button>
                    <button type="button" disabled={pending} onClick={remove}
                        className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
                        {pending ? 'Menghapus…' : 'Hapus'}
                    </button>
                </div>
            </section>
        </div>
    );
}

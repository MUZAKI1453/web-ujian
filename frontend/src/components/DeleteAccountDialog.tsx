import { useState } from 'react';
import api from '../services/api';

interface Props {
    role: 'siswa' | 'guru' | 'kelas' | 'mapel';
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
            const message = err.response?.data?.message;
            setError(typeof message === 'string' && message
                ? message
                : err.response ? 'Gagal menghapus ' + getRoleLabel() + '.' : 'Server tidak dapat dijangkau. Cek koneksi, lalu coba lagi.');
        } finally {
            setPending(false);
        }
    }

    // Label dinamis untuk judul dialog
    const getRoleLabel = () => {
        if (role === 'siswa') return 'akun siswa';
        if (role === 'guru') return 'akun guru';
        if (role === 'kelas') return 'data kelas';
        return 'mata pelajaran';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title"
                     className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-xl">
                <h3 id="delete-account-title" className="text-lg font-bold">
                    Hapus {ids.length} {getRoleLabel()}?
                </h3>
                {role === 'siswa' && (
                    <p className="text-sm text-gray-500">
                        Riwayat pengerjaan dan jawaban ujian siswa terpilih juga akan terhapus.
                    </p>
                )}
                {role === 'kelas' && (
                    <p className="text-sm text-gray-500">
                        Jika ada kelas terpilih yang masih memiliki siswa, seluruh penghapusan dibatalkan. Penugasan dan ujian terkait ikut terhapus saat kelas dihapus.
                    </p>
                )}
                {role === 'mapel' && (
                    <p className="text-sm text-gray-500">
                        Penugasan guru, ujian, soal, jawaban, dan nilai yang terkait dengan mata pelajaran ini juga akan terhapus.
                    </p>
                )}
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" autoFocus disabled={pending} onClick={onClose}
                            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 transition">
                        Batal
                    </button>
                    <button type="button" disabled={pending} onClick={remove}
                            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-red-700 disabled:opacity-50 transition">
                        {pending ? 'Menghapus…' : 'Hapus'}
                    </button>
                </div>
            </section>
        </div>
    );
}

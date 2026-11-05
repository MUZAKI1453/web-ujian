import ModalOverlay from './ModalOverlay';
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
        <ModalOverlay onClose={() => { if (!pending) onClose(); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="delete-account-title"
                     className="ui-dialog-panel max-w-sm space-y-4">
                <h3 id="delete-account-title" className="text-lg font-bold">
                    Hapus {ids.length} {getRoleLabel()}?
                </h3>
                {role === 'siswa' && (
                    <p className="text-sm text-slate-500">
                        Riwayat pengerjaan dan jawaban ujian siswa terpilih juga akan terhapus.
                    </p>
                )}
                {role === 'kelas' && (
                    <p className="text-sm text-slate-500">
                        Jika ada kelas terpilih yang masih memiliki siswa, seluruh penghapusan dibatalkan. Penugasan dan ujian terkait ikut terhapus saat kelas dihapus.
                    </p>
                )}
                {role === 'mapel' && (
                    <p className="text-sm text-slate-500">
                        Penugasan guru, ujian, soal, jawaban, dan nilai yang terkait dengan mata pelajaran ini juga akan terhapus.
                    </p>
                )}
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" autoFocus disabled={pending} onClick={onClose}
                            className="ui-button ui-button-secondary">
                        Batal
                    </button>
                    <button type="button" disabled={pending} onClick={remove}
                            className="ui-button ui-button-danger">
                        {pending ? 'Menghapus…' : 'Hapus'}
                    </button>
                </div>
            </section>
        </ModalOverlay>
    );
}

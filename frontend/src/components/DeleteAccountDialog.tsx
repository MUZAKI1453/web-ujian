import ActionDialog from './ActionDialog';
import { useState } from 'react';
import api from '../services/api';

interface Props {
    role: 'siswa' | 'guru' | 'kelas' | 'mapel' | 'jenis-ujian';
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
        if (role === 'jenis-ujian') return 'jenis ujian';
        return 'mata pelajaran';
    };

    const messages: Record<Props['role'], string> = {
        siswa: 'Riwayat pengerjaan dan jawaban ujian siswa terpilih juga akan terhapus.',
        guru: 'Akun guru yang dipilih akan dihapus.',
        kelas: 'Penugasan dan ujian terkait ikut terhapus. Jika ada kelas terpilih yang masih memiliki siswa, seluruh penghapusan dibatalkan.',
        mapel: 'Penugasan guru, ujian, soal, jawaban, dan nilai terkait juga akan terhapus.',
        'jenis-ujian': 'Jika salah satu jenis ujian sudah digunakan, seluruh penghapusan dibatalkan.'
    };
    return <ActionDialog title={`Hapus ${ids.length} ${getRoleLabel()}?`} message={messages[role]} tone="danger"
        confirmLabel={pending ? 'Menghapus…' : 'Hapus'} pending={pending} onClose={onClose} onConfirm={() => void remove()}>
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
    </ActionDialog>;
}

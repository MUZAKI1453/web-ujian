import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import ActionDialog from './ActionDialog';

export type ResettableAccount = { id: number; username: string; nama: string | null };
export type AccountRole = 'siswa' | 'guru';

export default function ResetAccountPasswordDialog({ role, account, onClose, onSuccess }: {
    role: AccountRole;
    account: ResettableAccount;
    onClose: () => void;
    onSuccess: (message: string) => void;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const submitting = useRef(false);
    const idLabel = role === 'siswa' ? 'NIS' : 'NIP';

    async function resetPassword() {
        if (submitting.current) return;
        submitting.current = true;
        setPending(true);
        setError('');
        try {
            const { data } = await api.post<{ message: string }>(`/admin/${role}/${account.id}/reset-password`, {
                username: account.username
            });
            onSuccess(data.message);
            onClose();
        } catch (err) {
            setError(isAxiosError(err) ? err.response?.data?.message || 'Gagal mereset password.' : 'Gagal mereset password.');
        } finally {
            submitting.current = false;
            setPending(false);
        }
    }

    return <ActionDialog
        title={role === 'siswa' ? 'Reset Password Siswa?' : 'Reset Password Guru?'}
        message={`Password akun ${account.nama || account.username} akan dikembalikan ke ${idLabel} (${account.username}). Sesi aktif akan diakhiri dan pengguna wajib mengganti password saat login kembali.`}
        tone="warning"
        centered
        pending={pending}
        confirmLabel={pending ? 'Mereset…' : 'Reset Password'}
        onClose={onClose}
        onConfirm={resetPassword}
    >
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
    </ActionDialog>;
}

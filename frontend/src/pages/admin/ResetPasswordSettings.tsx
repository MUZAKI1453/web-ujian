import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import ResetAccountPasswordDialog, { type ResettableAccount } from '../../components/ResetAccountPasswordDialog';
import Select from '../../components/ui/Select';
import api from '../../services/api';

// Reset hanya untuk akun guru. Password siswa dibuat sistem dan dikelola di menu Password Siswa.
export default function ResetPasswordSettings() {
    const [accounts, setAccounts] = useState<ResettableAccount[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [attempt, setAttempt] = useState(0);
    const [confirming, setConfirming] = useState(false);
    const [success, setSuccess] = useState('');
    const account = accounts.find(item => String(item.id) === selectedId);

    useEffect(() => {
        const request = new AbortController();
        api.get<{ data: ResettableAccount[] }>('/admin/guru', { signal: request.signal })
            .then(({ data }) => {
                if (request.signal.aborted) return;
                setAccounts(data.data);
                setStatus('ready');
            })
            .catch(() => {
                if (!request.signal.aborted) setStatus('error');
            });
        return () => request.abort();
    }, [attempt]);

    return <section className="ui-card space-y-4 p-4 sm:p-5" aria-labelledby="reset-password-title">
        <div className="space-y-2">
            <h2 id="reset-password-title" className="flex items-center gap-2 text-lg font-bold">
                <UsersRound size={20} className="text-blue-600" aria-hidden="true" />Reset Password Guru
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">Kembalikan password akun guru ke NIP. Password siswa dikelola di menu Password Siswa.</p>
        </div>
        <label className="ui-label block min-w-0">
            Akun guru
            <Select value={selectedId} disabled={status !== 'ready' || !accounts.length} className="ui-input mt-1 w-full"
                onValueChange={value => { setSelectedId(value); setSuccess(''); }}>
                <option value="">{status === 'loading' ? 'Memuat akun…' : 'Pilih akun guru'}</option>
                {accounts.map(item => <option key={item.id} value={item.id}>
                    {item.nama || 'Tanpa nama'} · NIP {item.username}
                </option>)}
            </Select>
        </label>
        {status === 'error' && <p role="alert" className="ui-notice ui-notice-error">Daftar akun gagal dimuat.</p>}
        {status === 'ready' && !accounts.length && <p role="status" className="text-sm text-slate-600">Belum ada akun guru.</p>}
        {success && <p role="status" className="ui-notice ui-notice-success">{success}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            {status === 'error' && <button type="button" className="ui-button ui-button-secondary" onClick={() => {
                setStatus('loading');
                setAttempt(value => value + 1);
            }}>Muat ulang daftar</button>}
            <button type="button" disabled={!account} className="ui-button ui-button-primary w-full sm:w-auto" onClick={() => setConfirming(true)}>
                Reset password
            </button>
        </div>
        {confirming && account && <ResetAccountPasswordDialog role="guru" account={account}
            onClose={() => setConfirming(false)} onSuccess={setSuccess} />}
    </section>;
}

import { FormEvent, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import { KeyRound } from 'lucide-react';

export default function GantiPassword() {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const passwordLama = values.get('passwordLama');
        const passwordBaru = values.get('passwordBaru');
        setError('');
        setSuccess(false);
        if (passwordBaru !== values.get('konfirmasi')) {
            setError('Konfirmasi password baru belum cocok.');
            return;
        }
        setSaving(true);
        try {
            await api.put('/auth/password', { passwordLama, passwordBaru });
            form.reset();
            setSuccess(true);
        } catch (err) {
            setError(isAxiosError(err) ? err.response?.data?.message || 'Gagal mengubah password.' : 'Gagal mengubah password.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="ui-card space-y-4 p-4 sm:p-5" aria-labelledby="password-settings-title">
            <div className="space-y-2">
                <h2 id="password-settings-title" className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} className="text-blue-600" aria-hidden="true" />Ganti Password</h2>
                <p className="text-sm leading-relaxed text-slate-600">Gunakan password baru yang berbeda dari password lama, minimal 8 karakter dan maksimal 72 byte.</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    {[
                        { name: 'passwordLama', label: 'Password lama', current: true },
                        { name: 'passwordBaru', label: 'Password baru', current: false },
                        { name: 'konfirmasi', label: 'Ulangi password baru', current: false }
                    ].map(field => (
                        <label key={field.name} className="ui-label block">
                            {field.label}
                            <input type="password" name={field.name} required minLength={field.current ? undefined : 8}
                                autoComplete={field.current ? 'current-password' : 'new-password'}
                                className="ui-input mt-1 block w-full min-w-0" />
                        </label>
                    ))}
                </div>
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                {success && <p role="status" className="ui-notice ui-notice-success">Password berhasil diubah.</p>}
                <div className="flex justify-end border-t border-slate-100 pt-3">
                    <button type="submit" disabled={saving} className="ui-button ui-button-primary w-full sm:w-auto">
                        {saving ? 'Menyimpan…' : 'Simpan password'}
                    </button>
                </div>
            </form>
        </section>
    );
}

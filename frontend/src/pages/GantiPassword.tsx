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
        <section className="ui-card space-y-5 p-5 sm:p-6" aria-labelledby="password-settings-title">
            <div className="space-y-2">
                <h2 id="password-settings-title" className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} className="text-blue-600" aria-hidden="true" />Ganti Password</h2>
                <p className="text-sm leading-relaxed text-slate-600">Gunakan password baru yang berbeda dari password lama, minimal 8 karakter dan maksimal 72 byte.</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
                {[
                    { name: 'passwordLama', label: 'Password lama', current: true },
                    { name: 'passwordBaru', label: 'Password baru', current: false },
                    { name: 'konfirmasi', label: 'Ulangi password baru', current: false }
                ].map(field => (
                    <label key={field.name} className="ui-label block">
                        {field.label}
                        <input type="password" name={field.name} required minLength={field.current ? undefined : 8}
                            autoComplete={field.current ? 'current-password' : 'new-password'}
                            className="ui-input mt-1 block w-full border" />
                    </label>
                ))}
                {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
                {success && <p role="status" className="ui-notice ui-notice-success">Password berhasil diubah.</p>}
                <button type="submit" disabled={saving} className="ui-button ui-button-primary">
                    {saving ? 'Menyimpan…' : 'Simpan password'}
                </button>
            </form>
        </section>
    );
}

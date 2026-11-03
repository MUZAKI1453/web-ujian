import { FormEvent, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';

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
        <section className="max-w-lg rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="mb-4 text-2xl font-bold text-slate-800">Ganti Password</h1>
            <form onSubmit={submit} className="space-y-4">
                {[
                    { name: 'passwordLama', label: 'Password lama', current: true },
                    { name: 'passwordBaru', label: 'Password baru', current: false },
                    { name: 'konfirmasi', label: 'Ulangi password baru', current: false }
                ].map(field => (
                    <label key={field.name} className="block text-sm font-semibold text-slate-700">
                        {field.label}
                        <input type="password" name={field.name} required minLength={field.current ? undefined : 8}
                            autoComplete={field.current ? 'current-password' : 'new-password'}
                            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" />
                    </label>
                ))}
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                {success && <p role="status" className="text-sm text-green-700">Password berhasil diubah.</p>}
                <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {saving ? 'Menyimpan…' : 'Simpan password'}
                </button>
            </form>
        </section>
    );
}

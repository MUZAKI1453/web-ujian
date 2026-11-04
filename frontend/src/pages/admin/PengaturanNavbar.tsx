import { useState, type FormEvent } from 'react';
import api from '../../services/api';

export interface NavbarSettings {
    text: string;
    logo: string | null;
}

export const defaultNavbar = { text: 'SMPIP Baitussalam', logo: '/assets/logo_smpip.png' };

interface Props {
    settings: NavbarSettings;
    onSaved: (settings: NavbarSettings) => void;
}

export default function PengaturanNavbar({ settings, onSaved }: Props) {
    const [text, setText] = useState(settings.text);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const logo = data.get('logo');
        setSaved(false);
        setError('');

        if (logo instanceof File && logo.size > 1024 * 1024) {
            setError('Ukuran gambar maksimal 1 MB.');
            return;
        }
        if (logo instanceof File && !logo.name) data.delete('logo');

        setPending(true);
        try {
            const { data: updated } = await api.put<NavbarSettings>('/admin/navbar', data, {
                headers: { 'Content-Type': undefined }
            });
            form.reset();
            setText(updated.text);
            onSaved(updated);
            setSaved(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Gagal menyimpan pengaturan navbar.');
        } finally {
            setPending(false);
        }
    }

    return (
        <section className="max-w-xl space-y-5 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-800">Pengaturan Navbar</h1>
            <form onSubmit={save}>
                <fieldset disabled={pending} className="space-y-4">
                    <label className="block text-sm font-semibold text-slate-700">
                        Teks navbar
                        <input name="text" value={text} onChange={event => setText(event.target.value)}
                               required maxLength={60} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                        Gambar logo
                        <img src={settings.logo || defaultNavbar.logo} alt="Logo saat ini" className="my-2 h-14 w-14 object-contain" />
                        <input name="logo" type="file" accept="image/png,image/jpeg,image/webp"
                               className="block w-full text-sm font-normal" />
                    </label>
                    <p className="text-xs text-slate-500">PNG, JPG, atau WebP, maksimal 1 MB. Kosongkan untuk memakai logo saat ini.</p>
                    <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {pending ? 'Menyimpan…' : 'Simpan pengaturan'}
                    </button>
                </fieldset>
            </form>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {saved && <p role="status" className="text-sm text-green-700">Pengaturan navbar tersimpan.</p>}
        </section>
    );
}

import { useState, type FormEvent } from 'react';
import api from '../../services/api';

export const navbarLogos = {
    smpip: '/assets/logo_smpip.png',
    smaip: '/assets/Logo_smaip.png',
};

export interface NavbarSettings {
    text: string;
    logo: keyof typeof navbarLogos;
}

export const defaultNavbar: NavbarSettings = { text: 'SMPIP Baitussalam', logo: 'smpip' };

interface Props {
    settings: NavbarSettings;
    onSaved: (settings: NavbarSettings) => void;
}

export default function PengaturanNavbar({ settings, onSaved }: Props) {
    const [text, setText] = useState(settings.text);
    const [logo, setLogo] = useState(settings.logo);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaved(false);
        setError('');

        setPending(true);
        try {
            const { data: updated } = await api.put<NavbarSettings>('/admin/navbar', { text, logo });
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
                        Logo navbar
                        <select name="logo" value={logo} onChange={event => setLogo(event.target.value === 'smaip' ? 'smaip' : 'smpip')}
                                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 font-normal">
                            <option value="smpip">SMPIP</option>
                            <option value="smaip">SMAIP</option>
                        </select>
                    </label>
                    <img src={navbarLogos[logo]} alt={'Pratinjau logo ' + logo.toUpperCase()} className="h-14 w-14 object-contain" />
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

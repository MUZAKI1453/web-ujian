import Select from '../../components/ui/Select';
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
            setError(err.response?.data?.message || 'Gagal menyimpan identitas aplikasi.');
        } finally {
            setPending(false);
        }
    }

    return (
        <section className="ui-card space-y-5 p-5 sm:p-6" aria-labelledby="app-identity-title">
            <div className="space-y-2">
                <h2 id="app-identity-title" className="text-lg font-bold">Identitas aplikasi</h2>
                <p className="text-sm leading-relaxed text-slate-600">Atur nama dan logo sekolah yang tampil pada navigasi untuk semua pengguna.</p>
            </div>
            <form onSubmit={save}>
                <fieldset disabled={pending} className="space-y-4">
                    <label className="ui-label block">
                        Nama aplikasi / sekolah
                        <input name="text" value={text} onChange={event => setText(event.target.value)}
                               required maxLength={60} className="ui-input mt-1 block w-full border" />
                    </label>
                    <label className="ui-label block">
                        Logo sekolah
                        <Select name="logo" value={logo} onValueChange={event => setLogo(event === 'smaip' ? 'smaip' : 'smpip')}
                                className="ui-input mt-1 block w-full border">
                            <option value="smpip">SMPIP</option>
                            <option value="smaip">SMAIP</option>
                        </Select>
                    </label>
                    <img src={navbarLogos[logo]} alt={'Pratinjau logo ' + logo.toUpperCase()} className="h-14 w-14 object-contain" />
                    <button type="submit" className="ui-button ui-button-primary">
                        {pending ? 'Menyimpan…' : 'Simpan pengaturan'}
                    </button>
                </fieldset>
            </form>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {saved && <p role="status" className="ui-notice ui-notice-success">Identitas aplikasi tersimpan.</p>}
        </section>
    );
}

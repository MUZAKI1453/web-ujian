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
        <section className="ui-card space-y-4 p-4 sm:p-5" aria-labelledby="app-identity-title">
            <div className="space-y-2">
                <h2 id="app-identity-title" className="text-lg font-bold">Identitas aplikasi</h2>
                <p className="text-sm leading-relaxed text-slate-600">Atur nama dan logo sekolah yang tampil pada navigasi untuk semua pengguna.</p>
            </div>
            <form onSubmit={save}>
                <fieldset disabled={pending} className="grid min-w-0 items-start gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:gap-x-5">
                    <label className="ui-label block min-w-0 sm:col-start-1 sm:row-start-1">
                        Nama aplikasi / sekolah
                        <input name="text" value={text} onChange={event => setText(event.target.value)}
                               required maxLength={60} className="ui-input mt-1 block w-full" />
                    </label>
                    <div className="min-w-0 sm:col-start-1 sm:row-start-2">
                        <label htmlFor="school-logo" className="ui-label">Logo sekolah</label>
                        <Select id="school-logo" name="logo" value={logo} onValueChange={event => setLogo(event === 'smaip' ? 'smaip' : 'smpip')}
                                className="mt-1 w-full">
                            <option value="smpip">SMPIP</option>
                            <option value="smaip">SMAIP</option>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
                        <p className="text-xs font-semibold text-slate-500">Preview identitas</p>
                        <div className="flex items-center gap-3">
                            <img src={navbarLogos[logo]} alt={'Logo ' + logo.toUpperCase()} className="size-10 shrink-0 object-contain" />
                            <p className="min-w-0 break-words text-sm font-semibold text-slate-800">{text || 'Nama aplikasi / sekolah'}</p>
                        </div>
                    </div>
                    <div className="flex justify-end border-t border-slate-100 pt-3 sm:col-span-2">
                        <button type="submit" className="ui-button ui-button-primary w-full sm:w-auto">
                            {pending ? 'Menyimpan…' : 'Simpan pengaturan'}
                        </button>
                    </div>
                </fieldset>
            </form>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
            {saved && <p role="status" className="ui-notice ui-notice-success">Identitas aplikasi tersimpan.</p>}
        </section>
    );
}

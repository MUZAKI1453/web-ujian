import { useState } from 'react';
import { KeyRound, PanelsTopLeft, Settings } from 'lucide-react';
import PengaturanNavbar, { type NavbarSettings } from './admin/PengaturanNavbar';
import GantiPassword from './GantiPassword';
import ResetPasswordSettings from './admin/ResetPasswordSettings';

export default function Pengaturan({ isAdmin, schoolPassword = false, navbar, navbarLoaded, onNavbarSaved, initialSection }: {
    isAdmin: boolean; schoolPassword?: boolean; navbar: NavbarSettings; navbarLoaded: boolean;
    onNavbarSaved: (settings: NavbarSettings) => void;
    initialSection?: 'umum' | 'keamanan';
}) {
    const [section, setSection] = useState<'umum' | 'keamanan'>(initialSection ?? (isAdmin ? 'umum' : 'keamanan'));
    return <section className="mx-auto w-full max-w-3xl space-y-3 sm:space-y-4">
        <header className="space-y-1">
            <h1 className="ui-page-title flex items-center gap-3"><Settings className="shrink-0 text-blue-600" size={28} aria-hidden="true" />Pengaturan</h1>
            <p className="text-sm leading-relaxed text-slate-600">{isAdmin ? 'Kelola identitas aplikasi dan keamanan akun.' : 'Kelola keamanan akun Anda.'}</p>
        </header>
        {isAdmin && <nav aria-label="Kategori pengaturan" className="flex gap-3 border-b border-slate-200 sm:gap-5">
                <button type="button" aria-current={section === 'umum' ? 'true' : undefined} aria-controls="settings-panel"
                    onClick={() => setSection('umum')}
                    className={'flex min-h-11 items-center gap-2 border-b-2 px-2 text-sm font-semibold ' + (section === 'umum' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-blue-700')}>
                    <PanelsTopLeft size={18} className="shrink-0" aria-hidden="true" />Umum
                </button>
                <button type="button" aria-current={section === 'keamanan' ? 'true' : undefined} aria-controls="settings-panel"
                    onClick={() => setSection('keamanan')}
                    className={'flex min-h-11 items-center gap-2 border-b-2 px-2 text-sm font-semibold ' + (section === 'keamanan' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-blue-700')}>
                    <KeyRound size={18} className="shrink-0" aria-hidden="true" />Keamanan
                </button>
        </nav>}
        <div id="settings-panel" className="min-w-0">
            {isAdmin && section === 'umum' ? navbarLoaded
                ? <PengaturanNavbar settings={navbar} onSaved={onNavbarSaved} />
                : <p role="status" className="ui-notice ui-notice-warning">Identitas aplikasi belum dapat dimuat. Muat ulang halaman untuk mencoba lagi. Anda tetap dapat membuka pengaturan Keamanan.</p>
                : <div className="space-y-3 sm:space-y-4">
                    {schoolPassword
                        ? <p className="ui-card p-4 text-sm leading-relaxed text-slate-600 sm:p-5">Password akun Anda dibuat oleh sekolah dan tertera di kartu peserta. Bila lupa atau diketahui orang lain, hubungi guru atau pengawas.</p>
                        : <GantiPassword />}
                    {isAdmin && <ResetPasswordSettings />}
                </div>}
        </div>
    </section>;
}

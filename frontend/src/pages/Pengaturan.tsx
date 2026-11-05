import { useState } from 'react';
import { KeyRound, PanelsTopLeft, Settings } from 'lucide-react';
import PengaturanNavbar, { type NavbarSettings } from './admin/PengaturanNavbar';
import GantiPassword from './GantiPassword';

export default function Pengaturan({ isAdmin, navbar, navbarLoaded, onNavbarSaved }: {
    isAdmin: boolean; navbar: NavbarSettings; navbarLoaded: boolean;
    onNavbarSaved: (settings: NavbarSettings) => void;
}) {
    const [section, setSection] = useState<'umum' | 'keamanan'>(isAdmin ? 'umum' : 'keamanan');
    return <section className="ui-content space-y-6">
        <header className="space-y-2">
            <h1 className="ui-page-title flex items-center gap-3"><Settings className="shrink-0 text-blue-600" size={28} aria-hidden="true" />Pengaturan</h1>
            <p className="text-sm leading-relaxed text-slate-600">{isAdmin ? 'Kelola identitas aplikasi dan keamanan akun Anda.' : 'Kelola keamanan akun Anda.'}</p>
        </header>
        <div className="grid items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label="Kategori pengaturan" className="ui-card flex gap-2 p-3 md:flex-col">
                {isAdmin && <button type="button" aria-current={section === 'umum' ? 'page' : undefined}
                    onClick={() => setSection('umum')}
                    className={'ui-button flex-1 !justify-start md:flex-none ' + (section === 'umum' ? 'ui-button-soft' : 'ui-button-secondary')}>
                    <PanelsTopLeft size={18} aria-hidden="true" />Umum
                </button>}
                <button type="button" aria-current={section === 'keamanan' ? 'page' : undefined}
                    onClick={() => setSection('keamanan')}
                    className={'ui-button flex-1 !justify-start md:flex-none ' + (section === 'keamanan' ? 'ui-button-soft' : 'ui-button-secondary')}>
                    <KeyRound size={18} aria-hidden="true" />Keamanan
                </button>
            </nav>
            <div className="min-w-0">
                {isAdmin && section === 'umum' ? navbarLoaded
                    ? <PengaturanNavbar settings={navbar} onSaved={onNavbarSaved} />
                    : <p role="status" className="ui-notice ui-notice-warning">Identitas aplikasi belum dapat dimuat. Muat ulang halaman untuk mencoba lagi. Anda tetap dapat membuka pengaturan Keamanan.</p>
                    : <GantiPassword />}
            </div>
        </div>
    </section>;
}

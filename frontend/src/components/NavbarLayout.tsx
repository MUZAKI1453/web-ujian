import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, BookOpen, ChevronDown, ClipboardList, GraduationCap, History, Layers, LayoutDashboard, LogOut, Menu, MonitorCheck, PanelLeftClose, PanelLeftOpen, Repeat2, Settings, ShieldCheck, Users, X, type LucideIcon } from 'lucide-react';
import { useDialogFocus } from './ui/useDialogFocus';

const viewLabels = { admin: 'Admin', guru: 'Guru', siswa: 'Siswa' } as const;
export type ViewRole = keyof typeof viewLabels;
type MenuItem = { page: string; label: string; icon: LucideIcon };
const masterMenus: MenuItem[] = [
    { page: 'guru', label: 'Data Guru', icon: GraduationCap },
    { page: 'siswa', label: 'Data Siswa', icon: Users },
    { page: 'kelas', label: 'Daftar Kelas', icon: Layers },
    { page: 'mapel', label: 'Mata Pelajaran', icon: BookOpen },
    { page: 'jenis-ujian', label: 'Jenis Ujian', icon: ClipboardList }
];
const teacherMenus: MenuItem[] = [
    { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { page: 'guru-ujian', label: 'Ujian Saya', icon: ClipboardList },
    { page: 'guru-analitik', label: 'Analitik Ujian', icon: BarChart3 }
];
const studentMenus: MenuItem[] = [
    { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { page: 'siswa-ujian', label: 'Ujian Saya', icon: ClipboardList },
    { page: 'siswa-hasil', label: 'Hasil Ujian', icon: History }
];
const adminMenus: MenuItem[] = [
    { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { page: 'monitoring', label: 'Monitoring Ujian', icon: MonitorCheck }
];
const roleIcons = { admin: ShieldCheck, guru: GraduationCap, siswa: Users };
const navButtonClass = 'flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors';

interface NavbarLayoutProps {
    user: { nama: string; role: string; username?: string; kelas?: string | null };
    brandText: string;
    brandLogo: string;
    onLogout: () => void;
    viewRole: string;
    onViewRoleChange?: (role: ViewRole) => void;
    activePage: string;
    onNavigate: (page: string) => void;
    children: ReactNode;
}

function MobileSidebar({ children, onClose }: { children: ReactNode; onClose: () => void }) {
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, onClose);
    return createPortal(<div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={panel} data-dialog-layer role="dialog" aria-modal="true" aria-label="Menu navigasi" tabIndex={-1}
            className="flex h-dvh w-72 max-w-[calc(100vw-2rem)] flex-col border-r border-slate-200 bg-white text-slate-800 shadow-2xl outline-none">
            {children}
        </div>
    </div>, document.body);
}

export default function NavbarLayout({ user, brandText, brandLogo, viewRole, onViewRoleChange, onLogout, activePage, onNavigate, children }: NavbarLayoutProps) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [switchOpen, setSwitchOpen] = useState(false);
    const shell = useRef<HTMLDivElement>(null);
    const menuTrigger = useRef<HTMLButtonElement>(null);
    const hadMobileOpen = useRef(false);
    const currentRole = viewRole in viewLabels ? viewRole as ViewRole : 'siswa';
    const menus = currentRole === 'admin' ? adminMenus : currentRole === 'guru' ? teacherMenus : studentMenus;
    const activeMenu = activePage === 'guru-mapel' ? 'guru-ujian' : activePage;
    const pageLabel = activePage === 'pengaturan' ? 'Pengaturan' : activePage === 'guru-mapel' ? 'Buat Ujian' :
        [...menus, ...masterMenus].find(item => item.page === activePage)?.label ?? 'Dashboard';
    const accountName = currentRole === 'admin' ? 'Admin' : user.nama || user.username || viewLabels[currentRole];
    const profileRole = viewLabels[currentRole] + (user.role === 'admin' && currentRole !== 'admin' ? ' · Preview admin' : '');
    const studentClass = user.role === 'siswa' ? user.kelas?.trim() : undefined;
    const profileDetail = studentClass
        ? `Siswa · ${/^kelas\s/i.test(studentClass) ? studentClass : `Kelas ${studentClass}`}`
        : profileRole;

    function closeMobile() {
        if (shell.current) shell.current.inert = false;
        setMobileOpen(false);
    }
    useEffect(() => {
        if (shell.current) shell.current.inert = mobileOpen;
        if (mobileOpen) hadMobileOpen.current = true;
        else if (hadMobileOpen.current) {
            menuTrigger.current?.focus();
            hadMobileOpen.current = false;
        }
        return () => { if (shell.current) shell.current.inert = false; };
    }, [mobileOpen]);
    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 1024px)');
        const resize = () => { if (desktop.matches) closeMobile(); };
        desktop.addEventListener('change', resize);
        return () => desktop.removeEventListener('change', resize);
    }, []);
    useEffect(() => { closeMobile(); }, [activePage, viewRole]);

    function navigate(page: string) {
        closeMobile();
        setSwitchOpen(false);
        onNavigate(page);
    }
    function changeRole(role: ViewRole) {
        closeMobile();
        setSwitchOpen(false);
        onViewRoleChange?.(role);
    }
    function sidebar(compact: boolean, mobile = false) {
        const navItem = ({ page, label, icon: Icon }: MenuItem) => <button key={page} type="button" onClick={() => navigate(page)}
            aria-label={compact ? label : undefined} title={compact ? label : undefined} aria-current={activePage === page ? 'page' : undefined}
            className={navButtonClass + (compact ? ' justify-center' : '') + ' ' +
                (activeMenu === page ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-inset ring-blue-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
            <Icon size={20} className="shrink-0" aria-hidden="true" />{!compact && <span className="min-w-0 break-words">{label}</span>}
        </button>;
        return <>
            <div className={'flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 ' + (compact ? 'px-3' : 'pl-6 pr-3')}>
                <button type="button" onClick={() => navigate('dashboard')} title={brandText} aria-label={brandText + ' — Dashboard'} className={'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left' + (compact ? ' justify-center' : '')}>
                    <span className="relative size-5 shrink-0"><img key={brandLogo} src={brandLogo} alt="" className="absolute left-1/2 top-1/2 size-10 max-w-none -translate-x-1/2 -translate-y-1/2 rounded-lg object-contain" /></span>
                    {!compact && <span className="line-clamp-2 min-w-0 break-words text-sm font-bold leading-5 text-slate-900">{brandText}</span>}
                </button>
                {mobile && <button type="button" onClick={closeMobile} aria-label="Tutup menu" className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={20} aria-hidden="true" /></button>}
            </div>
            <nav aria-label={'Navigasi ' + viewLabels[currentRole]} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-5">
                <div className="space-y-1">
                    {!compact && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Menu utama</p>}
                    {menus.map(navItem)}
                </div>
                {user.role === 'admin' && currentRole === 'admin' && <div className={'space-y-1 ' + (compact ? 'border-t border-slate-100 pt-4' : '')}>
                    {!compact && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Data Master</p>}
                    {masterMenus.map(navItem)}
                </div>}
            </nav>
            <div className="shrink-0 space-y-1 border-t border-slate-100 p-3">
                {user.role === 'admin' && onViewRoleChange && <div>
                    <button type="button" title={compact ? 'Ganti tampilan' : undefined} aria-label={'Ganti tampilan, mode ' + viewLabels[currentRole]}
                        aria-expanded={switchOpen && !compact} aria-controls={mobile ? 'mobile-role-options' : 'desktop-role-options'}
                        onClick={() => { if (compact) { setCollapsed(false); setSwitchOpen(true); } else setSwitchOpen(!switchOpen); }}
                        className={navButtonClass + ' text-slate-600 hover:bg-slate-100' + (compact ? ' justify-center' : '')}>
                        <Repeat2 size={20} className="shrink-0" aria-hidden="true" />
                        {!compact && <><span className="flex-1">Mode {viewLabels[currentRole]}</span><ChevronDown size={16} aria-hidden="true" className={'transition-transform ' + (switchOpen ? 'rotate-180' : '')} /></>}
                    </button>
                    {switchOpen && !compact && <div id={mobile ? 'mobile-role-options' : 'desktop-role-options'} className="mb-2 mt-1 space-y-1 rounded-xl bg-slate-50 p-1">
                        {(['admin', 'guru', 'siswa'] as const).map(role => {
                            const Icon = roleIcons[role];
                            return <button key={role} type="button" aria-pressed={currentRole === role} onClick={() => changeRole(role)}
                                className={navButtonClass + ' ' + (currentRole === role ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-white')}>
                                <Icon size={18} className="shrink-0" aria-hidden="true" />Mode {viewLabels[role]}
                            </button>;
                        })}
                    </div>}
                </div>}
                {navItem({ page: 'pengaturan', label: 'Pengaturan', icon: Settings })}
                <button type="button" title={compact ? 'Keluar' : undefined} aria-label="Keluar" onClick={() => { closeMobile(); onLogout(); }}
                    className={navButtonClass + ' text-red-600 hover:bg-red-50' + (compact ? ' justify-center' : '')}>
                    <LogOut size={20} className="shrink-0" aria-hidden="true" />{!compact && 'Keluar'}
                </button>
            </div>
        </>;
    }
    return <>
        <div ref={shell} className="ui-app min-h-screen font-sans">
            <a href="#main-content" className="sr-only z-[100] rounded-xl bg-blue-600 px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Lewati ke konten</a>
            <aside aria-label="Sidebar" className={'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ' + (collapsed ? 'w-20' : 'w-64')}>
                {sidebar(collapsed)}
            </aside>
            <div className={'min-h-screen min-w-0 transition-[padding] duration-200 ' + (collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
                <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white/95 backdrop-blur">
                    <div className="flex h-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
                        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                            <button ref={menuTrigger} type="button" aria-label="Buka menu" aria-expanded={mobileOpen} aria-haspopup="dialog" onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"><Menu size={22} aria-hidden="true" /></button>
                            <button type="button" aria-label={collapsed ? 'Perluas sidebar' : 'Ringkas sidebar'} title={collapsed ? 'Perluas sidebar' : 'Ringkas sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)} className="hidden size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 lg:grid">
                                {collapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
                            </button>
                            <p className="hidden min-w-0 truncate text-sm font-semibold text-slate-800 min-[400px]:block"><span className="hidden font-normal text-slate-400 sm:inline">{viewLabels[currentRole]}<span className="mx-2" aria-hidden="true">/</span></span>{pageLabel}</p>
                        </div>
                        <div className="flex min-w-0 max-w-[calc(100%_-_3.25rem)] items-center gap-2 min-[400px]:max-w-[60%] sm:gap-3">
                            <div className="min-w-0 text-right">
                                <p className="truncate text-xs font-semibold text-slate-800 sm:text-sm" title={accountName}>{accountName}</p>
                                {currentRole !== 'admin' && <p className="truncate text-xs text-slate-500" title={profileDetail}>{profileDetail}</p>}
                            </div>
                            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 sm:size-9">{accountName.charAt(0).toUpperCase()}</span>
                        </div>
                    </div>
                </header>
                <main id="main-content" tabIndex={-1} className="ui-content min-w-0 px-4 pb-10 pt-6 outline-none sm:px-6 lg:px-8">{children}</main>
            </div>
        </div>
        {mobileOpen && <MobileSidebar onClose={closeMobile}>{sidebar(false, true)}</MobileSidebar>}
    </>;
}

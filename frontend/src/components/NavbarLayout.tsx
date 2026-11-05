import React, { useState, useEffect, useRef } from 'react';
import { Layers, Users, LogOut, ChevronDown, Menu, X, Settings, MonitorCheck, Repeat2, Laptop, SquarePen, Undo2 } from 'lucide-react';

const viewLabels = { admin: 'Admin', guru: 'Guru', siswa: 'Siswa' } as const;
export type ViewRole = keyof typeof viewLabels;

interface NavbarLayoutProps {
    user: {
        nama: string;
        role: string;
        username?: string;
    };
    brandText: string;
    brandLogo: string;
    onLogout: () => void;
    viewRole: string;
    onViewRoleChange?: (role: ViewRole) => void;
    activePage: string;
    onNavigate: (page: string) => void;
    children: React.ReactNode;
}

export default function NavbarLayout({ user, brandText, brandLogo, viewRole, onViewRoleChange, onLogout, activePage, onNavigate, children }: NavbarLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [switchOpen, setSwitchOpen] = useState(false);
    const [dropdownMasterOpen, setDropdownMasterOpen] = useState(false);
    const [dropdownProfileOpen, setDropdownProfileOpen] = useState(false);
    const [mobileMasterOpen, setMobileMasterOpen] = useState(false);

    const switchRef = useRef<HTMLDivElement>(null);
    const masterRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (switchRef.current && !switchRef.current.contains(event.target as Node)) {
                setSwitchOpen(false);
            }
            if (masterRef.current && !masterRef.current.contains(event.target as Node)) {
                setDropdownMasterOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setDropdownProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const closeMenus = () => {
        setSwitchOpen(false);
        setDropdownMasterOpen(false);
        setDropdownProfileOpen(false);
        setMobileMenuOpen(false);
        setMobileMasterOpen(false);
    };

    const handleMenuClick = (page: string) => {
        onNavigate(page);
        closeMenus();
    };

    // Cek apakah halaman aktif berada di dalam ruang lingkup Data Master
    const isMasterActive = ['kelas', 'siswa', 'guru', 'mapel'].includes(activePage);
    const switchOptions = ([['guru', Laptop], ['siswa', SquarePen]] as const).map(([role, Icon]) => (
        <button key={role} type="button" aria-current={viewRole === role ? 'page' : undefined}
                onClick={() => { onViewRoleChange?.(role); closeMenus(); }}
                className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm font-medium hover:bg-white/10 lg:hover:bg-blue-50 lg:hover:text-blue-700">
            <Icon size={16} /> Mode {viewLabels[role]}
        </button>
    ));

    return (
        <div className="ui-app min-h-screen font-sans flex flex-col">
            {/* NAVBAR ATAS */}
            <nav className="ui-navbar text-white fixed top-0 left-0 right-0 z-50">
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">

                        {/* KIRI: Logo & Nama Brand */}
                        <div className="flex min-w-0 items-center gap-3">
                            <button onClick={() => handleMenuClick('dashboard')} className="flex min-w-0 items-center gap-3 text-left focus:outline-none" title={brandText}>
                                <img
                                    key={brandLogo}
                                    src={brandLogo}
                                    alt="Logo"
                                    className="h-9 w-9 shrink-0 object-contain drop-shadow"
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <span className="truncate font-bold text-base sm:text-xl tracking-wide text-white">
                                    {brandText}
                                </span>
                            </button>
                        </div>

                        {/* TENGAH: Menu Navigasi Desktop */}
                        <div className="hidden lg:flex items-center space-x-1">
                            {user.role === 'admin' && (
                                <>
                                    <button
                                        onClick={() => handleMenuClick('dashboard')}
                                        className={`px-3.5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${activePage === 'dashboard' && viewRole === 'admin' ? 'bg-white/20 shadow-inner' : 'hover:bg-white/10'}`}
                                    >
                                        <Layers size={18} /> Dashboard
                                    </button>

                                    <div className="relative" ref={switchRef}>
                                        <button type="button" aria-expanded={switchOpen}
                                                onClick={() => { setSwitchOpen(!switchOpen); setDropdownMasterOpen(false); setDropdownProfileOpen(false); }}
                                                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium ${viewRole !== 'admin' ? 'bg-white/20' : 'hover:bg-white/10'}`}>
                                            <Repeat2 size={18} /> Ganti Tampilan <ChevronDown size={14} />
                                        </button>
                                        {switchOpen && (
                                            <div className="ui-card absolute left-0 z-50 mt-2 w-44 border bg-white p-1 text-slate-800">
                                                {switchOptions}
                                            </div>
                                        )}
                                    </div>

                                    {/* Dropdown Data Master */}
                                    <div className="relative" ref={masterRef}>
                                        <button
                                            onClick={() => { setDropdownMasterOpen(!dropdownMasterOpen); setDropdownProfileOpen(false); setSwitchOpen(false); }}
                                            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 focus:outline-none ${isMasterActive ? 'bg-white/20' : 'hover:bg-white/10'}`}
                                        >
                                            <Users size={18} /> Data Master <ChevronDown size={14} className={`transition-transform duration-200 ${dropdownMasterOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {dropdownMasterOpen && (
                                            <div className="ui-card absolute left-0 mt-2 w-48 bg-white py-2 text-slate-800 border z-50 animate-in fade-in zoom-in-95 duration-150">
                                                <button onClick={() => handleMenuClick('kelas')} className={`w-full text-left px-4 py-2 text-sm font-medium transition ${activePage === 'kelas' ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-blue-50 hover:text-blue-600'}`}>Data Kelas</button>
                                                <button onClick={() => handleMenuClick('siswa')} className={`w-full text-left px-4 py-2 text-sm font-medium transition ${activePage === 'siswa' ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-blue-50 hover:text-blue-600'}`}>Data Siswa</button>
                                                <button onClick={() => handleMenuClick('guru')} className={`w-full text-left px-4 py-2 text-sm font-medium transition ${activePage === 'guru' ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-blue-50 hover:text-blue-600'}`}>Data Guru</button>
                                                <button onClick={() => handleMenuClick('mapel')} className={`w-full text-left px-4 py-2 text-sm font-medium transition ${activePage === 'mapel' ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-blue-50 hover:text-blue-600'}`}>Mata Pelajaran</button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleMenuClick('monitoring')}
                                        className={`px-3.5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${activePage === 'monitoring' ? 'bg-white/20' : 'hover:bg-white/10'}`}
                                    >
                                        <MonitorCheck size={18} /> Monitoring Ujian
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            {user.role === 'admin' && viewRole !== 'admin' && onViewRoleChange && (
                                <button type="button"
                                    aria-label="Kembali ke Admin"
                                    title={`Kembali ke Admin (Mode ${viewRole === 'guru' ? 'Guru' : 'Siswa'})`}
                                    onClick={() => { onViewRoleChange('admin'); closeMenus(); }}
                                    className="grid size-10 place-items-center rounded-xl bg-white/15 text-white transition hover:bg-white/25">
                                    <Undo2 size={20} aria-hidden="true" />
                                </button>
                            )}
                        {/* KANAN: Profil Sederhana Desktop */}
                        <div className="hidden lg:flex items-center relative" ref={profileRef}>
                            <button
                                onClick={() => { setDropdownProfileOpen(!dropdownProfileOpen); setDropdownMasterOpen(false); setSwitchOpen(false); }}
                                className="flex items-center gap-3 py-1.5 px-3 rounded-xl hover:bg-white/10 transition focus:outline-none"
                            >
                                <div className="w-9 h-9 rounded-full bg-white text-blue-600 font-bold flex items-center justify-center shadow-md text-sm">
                                    {user.nama ? user.nama.charAt(0).toUpperCase() : 'A'}
                                </div>
                                <span className="text-sm font-semibold text-white">
                                    {user.role === 'admin' ? 'Admin' : user.nama}
                                </span>
                                <ChevronDown size={14} className={`text-white/80 transition-transform duration-200 ${dropdownProfileOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {dropdownProfileOpen && (
                                <div className="ui-card absolute right-0 top-full mt-2 w-48 bg-white py-2 text-slate-800 border z-50 animate-in fade-in zoom-in-95 duration-150">
                                    <button type="button" onClick={() => handleMenuClick('pengaturan')}
                                        aria-current={activePage === 'pengaturan' ? 'page' : undefined}
                                        className={'flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors ' + (activePage === 'pengaturan' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50')}>
                                        <Settings size={18} className="shrink-0" aria-hidden="true" /> Pengaturan
                                    </button>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button
                                        onClick={onLogout}
                                        className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
                                    >
                                        <LogOut size={16} /> Keluar
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Tombol Hamburger Mobile */}
                        <div className="flex lg:hidden">
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={mobileMenuOpen}
                                className="size-11 grid place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition focus:outline-none"
                            >
                                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                        </div>
                    </div>
                </div>

                {/* MENU MOBILE DENGAN AKORDEON */}
                {mobileMenuOpen && (
                    <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto lg:hidden bg-blue-900 backdrop-blur-md px-4 pt-4 pb-6 border-t border-blue-600 space-y-3 shadow-2xl animate-in slide-in-from-top duration-200">
                        <div className="flex items-center justify-between px-3.5 py-3 bg-white/10 rounded-2xl mb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-white text-blue-600 font-bold flex items-center justify-center text-sm shadow">
                                    {user.nama ? user.nama.charAt(0).toUpperCase() : 'A'}
                                </div>
                                <div>
                                    <p className="text-sm font-bold leading-tight">{user.role === 'admin' ? 'Admin' : user.nama}</p>
                                    <p className="text-[11px] text-blue-200 uppercase tracking-wider">{viewRole}</p>
                                </div>
                            </div>
                        </div>

                        {user.role === 'admin' && (
                            <div className="space-y-1">
                                <button onClick={() => handleMenuClick('dashboard')} className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition">
                                    <Layers size={18} /> Dashboard
                                </button>

                                <details>
                                    <summary className="flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium hover:bg-white/10">
                                        <Repeat2 size={18} /> Ganti Tampilan <ChevronDown size={14} />
                                    </summary>
                                    <div className="ml-4 border-l border-blue-400/30 pl-4">{switchOptions}</div>
                                </details>

                                <div>
                                    <button
                                        onClick={() => setMobileMasterOpen(!mobileMasterOpen)}
                                        className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition focus:outline-none"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Users size={18} /> Data Master
                                        </div>
                                        <ChevronDown size={16} className={`transition-transform duration-200 ${mobileMasterOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {mobileMasterOpen && (
                                        <div className="pl-9 pr-2 py-1 space-y-1 my-1 border-l-2 border-blue-400/30 ml-4">
                                            <button onClick={() => handleMenuClick('kelas')} className={`block w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${activePage === 'kelas' ? 'bg-white/20 text-white font-bold' : 'text-blue-100 hover:bg-white/10'}`}>Data Kelas</button>
                                            <button onClick={() => handleMenuClick('siswa')} className={`block w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${activePage === 'siswa' ? 'bg-white/20 text-white font-bold' : 'text-blue-100 hover:bg-white/10'}`}>Data Siswa</button>
                                            <button onClick={() => handleMenuClick('guru')} className={`block w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${activePage === 'guru' ? 'bg-white/20 text-white font-bold' : 'text-blue-100 hover:bg-white/10'}`}>Data Guru</button>
                                            <button onClick={() => handleMenuClick('mapel')} className={`block w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${activePage === 'mapel' ? 'bg-white/20 text-white font-bold' : 'text-blue-100 hover:bg-white/10'}`}>Mata Pelajaran</button>
                                        </div>
                                    )}
                                </div>

                                <button onClick={() => handleMenuClick('monitoring')} className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition">
                                    <MonitorCheck size={18} /> Monitoring Ujian
                                </button>
                            </div>
                        )}

                        <div className="border-t border-blue-700/60 pt-3 mt-3 space-y-1">
                            <button type="button" onClick={() => handleMenuClick('pengaturan')}
                                aria-current={activePage === 'pengaturan' ? 'page' : undefined}
                                className={'flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ' + (activePage === 'pengaturan' ? 'bg-white/20 text-white' : 'text-blue-100 hover:bg-white/10')}>
                                <Settings size={18} className="shrink-0 text-blue-300" aria-hidden="true" /> Pengaturan
                            </button>
                            <button
                                onClick={onLogout}
                                className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-red-200 hover:bg-red-600/30 transition"
                            >
                                <LogOut size={18} /> Keluar
                            </button>
                        </div>
                    </div>
                )}
            </nav>

            {/* KONTEN UTAMA */}
            <main className="ui-content flex-1 px-4 sm:px-6 lg:px-8 mt-24 mb-10">
                {children}
            </main>
        </div>
    );
}

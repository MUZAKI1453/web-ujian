import React, { useState, useEffect, useRef } from 'react';
import { Layers, Users, LogOut, ChevronDown, Menu, X, Key, MonitorCheck } from 'lucide-react';

interface NavbarLayoutProps {
    user: {
        nama: string;
        role: string;
        username?: string;
    };
    onLogout: () => void;
    activePage: string;
    onNavigate: (page: string) => void;
    children: React.ReactNode;
}

export default function NavbarLayout({ user, onLogout, activePage, onNavigate, children }: NavbarLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [dropdownMasterOpen, setDropdownMasterOpen] = useState(false);
    const [dropdownProfileOpen, setDropdownProfileOpen] = useState(false);
    const [mobileMasterOpen, setMobileMasterOpen] = useState(false);

    const masterRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
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

    const handleMenuClick = (page: string) => {
        onNavigate(page);
        setDropdownMasterOpen(false);
        setMobileMenuOpen(false);
        setMobileMasterOpen(false);
    };

    // Cek apakah halaman aktif berada di dalam ruang lingkup Data Master
    const isMasterActive = ['kelas', 'siswa', 'guru', 'mapel'].includes(activePage);

    return (
        <div className="min-h-screen bg-slate-100 font-sans flex flex-col">
            {/* NAVBAR ATAS */}
            <nav className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white shadow-lg fixed top-0 left-0 right-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">

                        {/* KIRI: Logo & Nama Brand */}
                        <div className="flex items-center gap-3">
                            <button onClick={() => handleMenuClick('dashboard')} className="flex items-center gap-3 text-left focus:outline-none">
                                <img
                                    src="/assets/logo_smpip.png"
                                    alt="Logo"
                                    className="w-11 h-11 object-contain drop-shadow"
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <span className="font-bold text-base sm:text-xl tracking-wide text-white">
                                    SMPIP Baitussalam
                                </span>
                            </button>
                        </div>

                        {/* TENGAH: Menu Navigasi Desktop */}
                        <div className="hidden md:flex items-center space-x-1">
                            {user.role === 'admin' && (
                                <>
                                    <button
                                        onClick={() => handleMenuClick('dashboard')}
                                        className={`px-3.5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${activePage === 'dashboard' ? 'bg-white/20 shadow-inner' : 'hover:bg-white/10'}`}
                                    >
                                        <Layers size={18} /> Dashboard
                                    </button>

                                    {/* Dropdown Data Master */}
                                    <div className="relative" ref={masterRef}>
                                        <button
                                            onClick={() => { setDropdownMasterOpen(!dropdownMasterOpen); setDropdownProfileOpen(false); }}
                                            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 focus:outline-none ${isMasterActive ? 'bg-white/20' : 'hover:bg-white/10'}`}
                                        >
                                            <Users size={18} /> Data Master <ChevronDown size={14} className={`transition-transform duration-200 ${dropdownMasterOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {dropdownMasterOpen && (
                                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl py-2 text-slate-800 border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-150">
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

                        {/* KANAN: Profil Sederhana Desktop */}
                        <div className="hidden md:flex items-center relative" ref={profileRef}>
                            <button
                                onClick={() => { setDropdownProfileOpen(!dropdownProfileOpen); setDropdownMasterOpen(false); }}
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
                                <div className="absolute right-0 top-14 w-48 bg-white rounded-2xl shadow-2xl py-2 text-slate-800 border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-150">
                                    <button onClick={() => handleMenuClick('ganti-password')} className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                                        <Key size={16} className="text-slate-400" /> Ganti Password
                                    </button>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button
                                        onClick={onLogout}
                                        className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
                                    >
                                        <LogOut size={16} /> Logout
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Tombol Hamburger Mobile */}
                        <div className="flex md:hidden">
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition focus:outline-none"
                            >
                                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* MENU MOBILE DENGAN AKORDEON */}
                {mobileMenuOpen && (
                    <div className="md:hidden bg-blue-900/98 backdrop-blur-md px-4 pt-4 pb-6 border-t border-blue-600 space-y-3 shadow-2xl animate-in slide-in-from-top duration-200">
                        <div className="flex items-center justify-between px-3.5 py-3 bg-white/10 rounded-2xl mb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-white text-blue-600 font-bold flex items-center justify-center text-sm shadow">
                                    {user.nama ? user.nama.charAt(0).toUpperCase() : 'A'}
                                </div>
                                <div>
                                    <p className="text-sm font-bold leading-tight">{user.role === 'admin' ? 'Admin' : user.nama}</p>
                                    <p className="text-[11px] text-blue-200 uppercase tracking-wider">{user.role}</p>
                                </div>
                            </div>
                        </div>

                        {user.role === 'admin' && (
                            <div className="space-y-1">
                                <button onClick={() => handleMenuClick('dashboard')} className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition">
                                    <Layers size={18} /> Dashboard
                                </button>

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
                            <button onClick={() => handleMenuClick('ganti-password')} className="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium text-blue-100 hover:bg-white/10 transition">
                                <Key size={18} className="text-blue-300" /> Ganti Password
                            </button>
                            <button
                                onClick={onLogout}
                                className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-red-200 hover:bg-red-600/30 transition"
                            >
                                <LogOut size={18} /> Logout Sistem
                            </button>
                        </div>
                    </div>
                )}
            </nav>

            {/* KONTEN UTAMA */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 mt-28 mb-12">
                {children}
            </main>
        </div>
    );
}
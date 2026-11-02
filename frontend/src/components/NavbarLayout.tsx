import React, { useState, useEffect, useRef } from 'react';
import { Layers, GraduationCap, Users, LogOut, ChevronDown, Menu, X, Key, MonitorCheck } from 'lucide-react';

interface DashboardLayoutProps {
    user: {
        nama: string;
        role: string;
        username?: string;
    };
    onLogout: () => void;
    children: React.ReactNode;
}

export default function DashboardLayout({ user, onLogout, children }: DashboardLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [dropdownMasterOpen, setDropdownMasterOpen] = useState(false);
    const [dropdownProfileOpen, setDropdownProfileOpen] = useState(false);

    // State khusus untuk akordeon Data Master di mode Mobile agar bisa di-expand/collapse
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

    return (
        <div className="min-h-screen bg-slate-100 font-sans flex flex-col">
            {/* NAVBAR ATAS */}
            <nav className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white shadow-lg fixed top-0 left-0 right-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">

                        {/* KIRI: Logo & Nama Brand */}
                        <div className="flex items-center gap-3">
                            <a href="#" className="flex items-center gap-3">
                                <img
                                    src="/assets/logo_smpip.png"
                                    alt="Logo"
                                    className="w-11 h-11 object-contain drop-shadow"
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <span className="font-bold text-base sm:text-xl tracking-wide text-white">
                                    SMPIP Baitussalam
                                </span>
                            </a>
                        </div>

                        {/* TENGAH: Menu Navigasi Desktop */}
                        <div className="hidden md:flex items-center space-x-1">
                            {user.role === 'admin' && (
                                <>
                                    <a href="#" className="px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition flex items-center gap-2">
                                        <Layers size={18} /> Dashboard
                                    </a>

                                    {/* Dropdown Data Master Desktop */}
                                    <div className="relative" ref={masterRef}>
                                        <button
                                            onClick={() => { setDropdownMasterOpen(!dropdownMasterOpen); setDropdownProfileOpen(false); }}
                                            className="px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition flex items-center gap-2 focus:outline-none"
                                        >
                                            <Users size={18} /> Data Master <ChevronDown size={14} className={`transition-transform duration-200 ${dropdownMasterOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {dropdownMasterOpen && (
                                            <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl py-2 text-slate-800 border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                <a href="#" className="block px-4 py-2 text-sm font-medium hover:bg-blue-50 hover:text-blue-600 transition">Data Kelas</a>
                                                <a href="#" className="block px-4 py-2 text-sm font-medium hover:bg-blue-50 hover:text-blue-600 transition">Data Siswa</a>
                                                <a href="#" className="block px-4 py-2 text-sm font-medium hover:bg-blue-50 hover:text-blue-600 transition">Data Guru</a>
                                                <a href="#" className="block px-4 py-2 text-sm font-medium hover:bg-blue-50 hover:text-blue-600 transition">Mata Pelajaran</a>
                                            </div>
                                        )}
                                    </div>

                                    <a href="#" className="px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition flex items-center gap-2">
                                        <MonitorCheck size={18} /> Monitoring Ujian
                                    </a>
                                </>
                            )}

                            {user.role === 'guru' && (
                                <a href="#" className="px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition flex items-center gap-2">
                                    <Layers size={18} /> Dashboard Guru
                                </a>
                            )}

                            {user.role === 'siswa' && (
                                <a href="#" className="px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition flex items-center gap-2">
                                    <GraduationCap size={18} /> Ujian Saya
                                </a>
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
                                    <a href="#" className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                                        <Key size={16} className="text-slate-400" /> Ganti Password
                                    </a>
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

                {/* MENU MOBILE YANG LEBIH RAPI, MINIMALIS, & BER-AKORDEON */}
                {mobileMenuOpen && (
                    <div className="md:hidden bg-blue-900/98 backdrop-blur-md px-4 pt-4 pb-6 border-t border-blue-600 space-y-3 shadow-2xl animate-in slide-in-from-top duration-200">

                        {/* Info Ringkas Profil di Menu Mobile */}
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

                        {/* Daftar Navigasi Mobile */}
                        {user.role === 'admin' && (
                            <div className="space-y-1">
                                <a href="#" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition">
                                    <Layers size={18} /> Dashboard
                                </a>

                                {/* Menu Data Master dengan Akordeon Dropdown */}
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

                                    {/* Sub-menu Data Master (Muncul hanya jika akordeon dibuka) */}
                                    {mobileMasterOpen && (
                                        <div className="pl-9 pr-2 py-1 space-y-1 my-1 border-l-2 border-blue-400/30 ml-4">
                                            <a href="#" className="block px-3 py-2 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition">Data Kelas</a>
                                            <a href="#" className="block px-3 py-2 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition">Data Siswa</a>
                                            <a href="#" className="block px-3 py-2 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition">Data Guru</a>
                                            <a href="#" className="block px-3 py-2 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition">Mata Pelajaran</a>
                                        </div>
                                    )}
                                </div>

                                <a href="#" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition">
                                    <MonitorCheck size={18} /> Monitoring Ujian
                                </a>
                            </div>
                        )}

                        {/* Pengaturan Akun & Logout di Mobile */}
                        <div className="border-t border-blue-700/60 pt-3 mt-3 space-y-1">
                            <a href="#" className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-blue-100 hover:bg-white/10 transition">
                                <Key size={18} className="text-blue-300" /> Ganti Password
                            </a>
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
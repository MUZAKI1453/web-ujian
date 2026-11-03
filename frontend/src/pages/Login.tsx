import React, { useState } from 'react';
import api from '../services/api';
import { Lock, User } from 'lucide-react';

export default function Login({ onLoginSuccess }: { onLoginSuccess: (user: any) => void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(() => sessionStorage.getItem('loginNotice') || '');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        sessionStorage.removeItem('loginNotice');
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/auth/login', { username, password });
            if (res.data.status === 'SUCCESS') {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                onLoginSuccess(res.data.user);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Terjadi kesalahan saat login.');
        } finally {
            setLoading(false);
        }
    };

    return (
        /* Background gradasi biru lembut (soft & minimalis) yang responsif penuh */
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-4 sm:px-6 lg:px-8">
            {/* Kartu login dengan lebar maksimal yang pas dan padding adaptif */}
            <div className="w-full max-w-sm sm:max-w-md bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 sm:p-10 border border-white/20 transition-all duration-300">

                <div className="text-center mb-6 sm:mb-8 flex flex-col items-center">
                    {/* Logo responsif (lebih kecil di HP, proporsional di PC) */}
                    <img
                        src="/assets/logo_smpip.png"
                        alt="Logo Sekolah"
                        className="w-20 h-20 sm:w-24 sm:h-24 object-contain mb-3 drop-shadow-sm"
                        onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                        }}
                    />
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">System Ujian Berbasis Web</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Silakan masuk menggunakan akun Anda</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs sm:text-sm rounded-xl text-center font-medium shadow-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
                    <div>
                        <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5 sm:mb-2">Username / NIS / NIP</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <User size={18} />
                            </span>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Masukkan username..."
                                className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition shadow-inner"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5 sm:mb-2">Password</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <Lock size={18} />
                            </span>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition shadow-inner"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 sm:py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition duration-200 flex items-center justify-center text-sm mt-2"
                    >
                        {loading ? 'Memproses Masuk...' : 'Masuk ke Sistem'}
                    </button>
                </form>
            </div>
        </div>
    );
}
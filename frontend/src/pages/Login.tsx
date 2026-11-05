import React, { useState } from 'react';
import api from '../services/api';
import { Lock, User } from 'lucide-react';

export default function Login({ onLoginSuccess, brandLogo }: { onLoginSuccess: (user: any) => void; brandLogo: string }) {
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
        <div className="min-h-screen w-full flex items-center justify-center ui-login px-4 sm:px-6 lg:px-8">
            {/* Kartu login dengan lebar maksimal yang pas dan padding adaptif */}
            <div className="ui-dialog-panel max-w-md p-6 sm:p-8">

                <div className="text-center mb-6 sm:mb-8 flex flex-col items-center">
                    {/* Logo responsif (lebih kecil di HP, proporsional di PC) */}
                    <img
                        key={brandLogo}
                        src={brandLogo}
                        alt="Logo Sekolah"
                        className="w-20 h-20 sm:w-24 sm:h-24 object-contain mb-3 drop-shadow-sm"
                        onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                        }}
                    />
                    <h1 className="ui-page-title tracking-tight">Sistem Ujian Berbasis Web</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Silakan masuk menggunakan akun Anda</p>
                </div>

                {error && (
                    <div role="alert" className="ui-notice ui-notice-error mb-4">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
                    <div>
                        <label htmlFor="login-identifier" className="ui-label mb-2 block">NIS / NIP</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <User size={18} />
                            </span>
                            <input
                                id="login-identifier"
                                autoComplete="username"
                                autoCapitalize="none"
                                autoCorrect="off"
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Masukkan NIS atau NIP..."
                                className="ui-input w-full pl-11 pr-4 sm:py-3 border transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="login-password" className="ui-label mb-2 block">Password</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <Lock size={18} />
                            </span>
                            <input
                                id="login-password"
                                autoComplete="current-password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="ui-input w-full pl-11 pr-4 sm:py-3 border transition"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="ui-button ui-button-primary mt-2 w-full"
                    >
                        {loading ? 'Memproses Masuk...' : 'Masuk ke Sistem'}
                    </button>
                </form>
            </div>
        </div>
    );
}

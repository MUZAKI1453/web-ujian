import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, GraduationCap, BookOpen, Layers } from 'lucide-react';

export default function DashboardAdmin({ onNavigate }: { onNavigate: (page: string) => void }) {
    const [stats, setStats] = useState({
        totalKelas: 0,
        totalSiswa: 0,
        totalGuru: 0,
        totalMapel: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/admin/dashboard')
            .then((res) => {
                if (res.data.status === 'SUCCESS') {
                    setStats(res.data.data);
                }
                setLoading(false);
            })
            .catch((err) => {
                console.error('Gagal memuat data dashboard:', err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-gray-600">
                <p className="text-lg font-medium animate-pulse">Memuat Statistik Dashboard...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Banner Sambutan dengan Efek Hover Halus */}
            <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 pointer-events-none transition-transform duration-500 hover:scale-105"></div>
                <h3 className="text-xl sm:text-2xl font-bold mb-2 tracking-tight">
                    Selamat Datang di Portal Ujian SMPIP Baitussalam 🚀
                </h3>
                <p className="text-blue-100 max-w-3xl text-sm sm:text-base leading-relaxed opacity-95">
                    Sistem manajemen ujian sekolah berbasis web terintegrasi untuk pengelolaan data akademik dan monitoring ujian secara real-time.
                </p>
            </div>

            {/* Kartu Statistik dengan Efek Interaktif Ketika Dilewati Kursor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* Kartu 1: Total Kelas */}
                <button type="button" onClick={() => onNavigate('kelas')} aria-label={`Buka Data Kelas, total ${stats.totalKelas}`} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-blue-200 group cursor-pointer">
                    <div>
                        <p className="text-sm text-gray-500 font-medium group-hover:text-blue-600 transition-colors">Total Kelas</p>
                        <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.totalKelas}</h3>
                    </div>
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <Layers size={28} />
                    </div>
                </button>

                {/* Kartu 2: Total Siswa */}
                <button type="button" onClick={() => onNavigate('siswa')} aria-label={`Buka Data Siswa, total ${stats.totalSiswa}`} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-emerald-200 group cursor-pointer">
                    <div>
                        <p className="text-sm text-gray-500 font-medium group-hover:text-emerald-600 transition-colors">Total Siswa</p>
                        <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.totalSiswa}</h3>
                    </div>
                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <Users size={28} />
                    </div>
                </button>

                {/* Kartu 3: Total Guru */}
                <button type="button" onClick={() => onNavigate('guru')} aria-label={`Buka Data Guru, total ${stats.totalGuru}`} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-amber-200 group cursor-pointer">
                    <div>
                        <p className="text-sm text-gray-500 font-medium group-hover:text-amber-600 transition-colors">Total Guru</p>
                        <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.totalGuru}</h3>
                    </div>
                    <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <GraduationCap size={28} />
                    </div>
                </button>

                {/* Kartu 4: Mata Pelajaran */}
                <button type="button" onClick={() => onNavigate('mapel')} aria-label={`Buka Mata Pelajaran, total ${stats.totalMapel}`} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-purple-200 group cursor-pointer">
                    <div>
                        <p className="text-sm text-gray-500 font-medium group-hover:text-purple-600 transition-colors">Mata Pelajaran</p>
                        <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.totalMapel}</h3>
                    </div>
                    <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <BookOpen size={28} />
                    </div>
                </button>

            </div>
        </div>
    );
}

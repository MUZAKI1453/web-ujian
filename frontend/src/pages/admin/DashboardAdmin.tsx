import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, GraduationCap, BookOpen, Layers } from 'lucide-react';
import { PortalHeader, PortalStat } from '../../components/PortalHeader';

export default function DashboardAdmin({ onNavigate }: { onNavigate: (page: string) => void }) {
    const [stats, setStats] = useState({ totalKelas: 0, totalSiswa: 0, totalGuru: 0, totalMapel: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        api.get('/admin/dashboard', { signal: controller.signal })
            .then(({ data }) => { if (data.status === 'SUCCESS') setStats(data.data); })
            .catch(() => { if (!controller.signal.aborted) setError('Statistik belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.'); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);
    const items = [
        { page: 'kelas', label: 'Total Kelas', value: stats.totalKelas, icon: Layers },
        { page: 'siswa', label: 'Total Siswa', value: stats.totalSiswa, icon: Users },
        { page: 'guru', label: 'Total Guru', value: stats.totalGuru, icon: GraduationCap },
        { page: 'mapel', label: 'Mata Pelajaran', value: stats.totalMapel, icon: BookOpen }
    ];
    return <section className="cbt-portal">
        <PortalHeader name="Admin" subtitle="Kelola data akademik, penugasan guru, dan pantau pelaksanaan ujian sekolah." icon={Layers} />
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {loading && <p role="status" className="text-sm text-slate-600">Memuat statistik dashboard…</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map(item => <button key={item.page} type="button" className="rounded-2xl text-left transition-colors hover:bg-blue-50"
                onClick={() => onNavigate(item.page)} aria-label={'Buka ' + item.label}>
                <PortalStat value={loading || error ? '—' : item.value} label={item.label} icon={item.icon} />
            </button>)}
        </div>
    </section>;
}

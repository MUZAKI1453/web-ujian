import { useEffect, useState } from 'react';
import NavbarLayout from './components/NavbarLayout';
import Login from './pages/Login';
import DashboardAdmin from './pages/admin/DashboardAdmin';
import DataKelas from './pages/admin/DataKelas';
import DataSiswa from './pages/admin/DataSiswa';
import DataGuru from './pages/admin/DataGuru';
import DataMapel from './pages/admin/DataMapel';
import DataJenisUjian from './pages/admin/DataJenisUjian';
import MonitoringUjian from './pages/admin/MonitoringUjian';
import { defaultNavbar, navbarLogos, type NavbarSettings } from './pages/admin/PengaturanNavbar';
import api from './services/api';
import Pengaturan from './pages/Pengaturan';
import AnalitikUjian from './pages/guru/AnalitikUjian';
import UjianGuru from './pages/guru/UjianGuru';
import BerandaSiswa from './pages/siswa/BerandaSiswa';
import type { ViewRole } from './components/NavbarLayout';

interface User {
    username: string;
    nama: string;
    role: string;
    kelas?: string | null;
}

export default function App() {
    const [user, setUser] = useState<User | null>(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch {
            return null;
        }
    });
    const [page, setPage] = useState('dashboard');
    const [teacherNavigationKey, setTeacherNavigationKey] = useState(0);
    const [previewRole, setPreviewRole] = useState<ViewRole>('admin');
    const [navbar, setNavbar] = useState<NavbarSettings>(defaultNavbar);
    const [navbarLoaded, setNavbarLoaded] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        api.get<NavbarSettings | null>('/navbar', { signal: controller.signal })
            .then(({ data }) => {
                setNavbar(data ?? defaultNavbar);
                setNavbarLoaded(true);
            })
            .catch(() => {});
        return () => controller.abort();
    }, [user]);

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setPage('dashboard');
        setPreviewRole('admin');
    };

    const brandLogo = navbarLogos[navbar.logo] || navbarLogos.smpip;
    if (!user) return <Login onLoginSuccess={setUser} brandLogo={brandLogo} />;

    const viewRole = user.role === 'admin' ? previewRole : user.role;
    const changeView = (role: ViewRole) => {
        setPreviewRole(role);
        setPage('dashboard');
    };
    const navigate = (nextPage: string) => {
        if (['kelas', 'siswa', 'guru', 'mapel', 'jenis-ujian', 'monitoring'].includes(nextPage)) setPreviewRole('admin');
        setPage(nextPage);
        setTeacherNavigationKey(current => current + 1);
    };

    const pages: Record<string, React.ReactNode> = {
        dashboard: <DashboardAdmin onNavigate={setPage} />,
        kelas: <DataKelas />,
        siswa: <DataSiswa />,
        guru: <DataGuru />,
        mapel: <DataMapel />,
        'jenis-ujian': <DataJenisUjian />,
        monitoring: <MonitoringUjian />,
    };

    return (
        <NavbarLayout
            user={user}
            brandText={navbar.text}
            brandLogo={brandLogo}
            viewRole={viewRole}
            onViewRoleChange={user.role === 'admin' ? changeView : undefined}
            onLogout={logout}
            activePage={page}
            onNavigate={navigate}
        >
            {page === 'guru-analitik' && viewRole === 'guru' ? <AnalitikUjian />
                : page === 'pengaturan' ? <Pengaturan isAdmin={user.role === 'admin'} navbar={navbar} navbarLoaded={navbarLoaded} onNavbarSaved={setNavbar} /> : viewRole === 'admin' && pages[page] ? pages[page] : viewRole === 'guru' && ['dashboard', 'guru-ujian', 'guru-mapel'].includes(page) ? (
                <UjianGuru key={teacherNavigationKey} view={page === 'guru-ujian' ? 'ujian' : page === 'guru-mapel' ? 'mapel' : 'dashboard'} onNavigate={navigate} />
            ) : viewRole === 'siswa' && ['dashboard', 'siswa-ujian', 'siswa-hasil'].includes(page) ? (
                <BerandaSiswa username={user.username} adminMode={user.role === 'admin'}
                    view={page === 'siswa-hasil' ? 'hasil' : page === 'siswa-ujian' ? 'ujian' : 'dashboard'}
                    navigationKey={teacherNavigationKey} onNavigate={navigate} />
            ) : (
                <div className="ui-card bg-white p-6">
                    Halaman ini belum tersedia di repository.
                </div>
            )}
        </NavbarLayout>
    );
}

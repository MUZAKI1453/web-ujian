import { useState } from 'react';
import NavbarLayout from './components/NavbarLayout';
import Login from './pages/Login';
import DashboardAdmin from './pages/admin/DashboardAdmin';
import DataKelas from './pages/admin/DataKelas';
import DataSiswa from './pages/admin/DataSiswa';
import DataGuru from './pages/admin/DataGuru';
import DataMapel from './pages/admin/DataMapel';
import MonitoringUjian from './pages/admin/MonitoringUjian';
import GantiPassword from './pages/GantiPassword';
import UjianGuru from './pages/guru/UjianGuru';
import BerandaSiswa from './pages/siswa/BerandaSiswa';
import type { ViewRole } from './components/NavbarLayout';

interface User {
    username: string;
    nama: string;
    role: string;
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
    const [previewRole, setPreviewRole] = useState<ViewRole>('admin');

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setPage('dashboard');
        setPreviewRole('admin');
    };

    if (!user) return <Login onLoginSuccess={setUser} />;

    const viewRole = user.role === 'admin' ? previewRole : user.role;
    const changeView = (role: ViewRole) => {
        setPreviewRole(role);
        setPage('dashboard');
    };

    const pages: Record<string, React.ReactNode> = {
        dashboard: <DashboardAdmin />,
        kelas: <DataKelas />,
        siswa: <DataSiswa />,
        guru: <DataGuru />,
        mapel: <DataMapel />,
        monitoring: <MonitoringUjian />,
    };

    return (
        <NavbarLayout
            user={user}
            viewRole={viewRole}
            onViewRoleChange={user.role === 'admin' ? changeView : undefined}
            onLogout={logout}
            activePage={page}
            onNavigate={setPage}
        >
            {user.role === 'admin' && viewRole !== 'admin' && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    <span>Tampilan {viewRole === 'guru' ? 'Guru' : 'Siswa'}</span>
                    <button type="button" className="font-semibold underline" onClick={() => changeView('admin')}>
                        Kembali ke Admin
                    </button>
                </div>
            )}
            {page === 'ganti-password' ? <GantiPassword /> : viewRole === 'admin' && pages[page] ? pages[page] : page === 'dashboard' && viewRole === 'guru' ? (
                <UjianGuru name={user.nama || user.username} />
            ) : page === 'dashboard' && viewRole === 'siswa' ? (
                <BerandaSiswa name={user.nama || user.username} username={user.username} preview={user.role === 'admin'} />
            ) : (
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                    Halaman ini belum tersedia di repository.
                </div>
            )}
        </NavbarLayout>
    );
}

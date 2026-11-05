import Select from '../../components/ui/Select';
import { useEffect, useState } from 'react';
import api from '../../services/api';

interface Participant {
    id: number;
    nama: string | null;
    username: string;
    status: string;
    batasWaktu: string | null;
}

interface Session {
    id: string;
    judul: string;
    mapel: string;
    kelas: string;
    jenis: 'Reguler' | 'Susulan';
    nomorSusulan?: number;
    mulai: string;
    selesai: string;
    status: string;
    mengerjakan: number;
    mengirim: number;
    belumMulai: number;
    waktuHabis: number;
    peserta: Participant[];
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export default function MonitoringUjian() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [updated, setUpdated] = useState<Date | null>(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [kind, setKind] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        let next: ReturnType<typeof setTimeout>;
        async function refresh() {
            try {
                const { data } = await api.get<{ data: Session[] }>('/admin/ujian', { signal: controller.signal, timeout: 10000 });
                if (controller.signal.aborted) return;
                setSessions(data.data);
                setUpdated(new Date());
                setError('');
            } catch {
                if (!controller.signal.aborted) setError('Gagal memuat monitoring. Data terakhir tetap ditampilkan jika tersedia.');
            } finally {
                if (!controller.signal.aborted) next = setTimeout(refresh, 15000);
            }
        }
        void refresh();
        return () => {
            controller.abort();
            clearTimeout(next);
        };
    }, [refreshKey]);

    const visible = sessions.filter(session => (!filter || session.status === filter) && (!kind || session.jenis === kind));

    return (
        <section className="ui-card bg-white p-5 sm:p-8">
            <h1 className="ui-page-title">Monitoring Ujian</h1>
            <p className="mt-1 text-sm text-slate-600">Pantau peserta ujian reguler dan susulan. Data diperbarui otomatis setiap 15 detik.</p>
            <div className="my-5 flex flex-wrap items-center gap-3">
                <Select aria-label="Status ujian" value={filter} onValueChange={e => setFilter(e)}
                    className="ui-input border p-2">
                    <option value="">Semua status</option>
                    <option>Terjadwal</option>
                    <option>Berlangsung</option>
                    <option>Selesai</option>
                </Select>
                <Select aria-label="Jenis sesi" value={kind} onValueChange={e => setKind(e)}
                    className="ui-input border p-2">
                    <option value="">Semua sesi</option>
                    <option>Reguler</option>
                    <option>Susulan</option>
                </Select>
                <button type="button" onClick={() => setRefreshKey(value => value + 1)}
                    className="ui-button ui-button-primary">
                    Muat ulang
                </button>
                {updated && <span className="text-xs text-slate-500">Diperbarui {updated.toLocaleTimeString('id-ID')}</span>}
            </div>
            {error && <p role="alert" className="ui-notice ui-notice-error mb-4">{error}</p>}
            {!updated && !error && <p role="status">Memuat daftar ujian…</p>}
            {updated && !visible.length && <p className="text-sm text-slate-600">
                {filter || kind ? 'Tidak ada sesi yang cocok dengan filter.' : 'Belum ada ujian.'}
            </p>}
            <div className="space-y-3">
                {visible.map(session => (
                    <details key={session.id} className="rounded-xl border border-slate-200 p-4">
                        <summary className="cursor-pointer">
                            <strong className="text-slate-800">{session.judul}</strong>
                            <span className="ui-badge ml-2 bg-blue-50 text-blue-800">
                                {session.jenis}{session.nomorSusulan ? ' ' + session.nomorSusulan : ''} · {session.status}
                            </span>
                            <p className="mt-2 text-sm text-slate-600">
                                {session.mapel} · {session.kelas} · {dateFormat.format(new Date(session.mulai))} s.d. {dateFormat.format(new Date(session.selesai))}
                            </p>
                            <p className="mt-2 text-sm text-slate-700">
                                {session.peserta.length} peserta · {session.mengerjakan} mengerjakan · {session.mengirim} sudah mengirim · {session.belumMulai} belum mulai · {session.waktuHabis} waktu habis
                            </p>
                        </summary>
                        {session.peserta.length ? (
                            <div className="mt-3 overflow-x-auto">
                                <table className="ui-table w-full text-left text-sm">
                                    <thead className="bg-slate-50"><tr>
                                        {['NIS', 'Siswa', 'Status', 'Batas waktu'].map(label =>
                                            <th scope="col" className="p-2" key={label}>{label}</th>
                                        )}
                                    </tr></thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {session.peserta.map(student => <tr key={student.id}>
                                            <td className="p-2">{student.username}</td>
                                            <td className="p-2">{student.nama || '—'}</td>
                                            <td className="p-2">{student.status}</td>
                                            <td className="p-2">{student.batasWaktu ? dateFormat.format(new Date(student.batasWaktu)) : '—'}</td>
                                        </tr>)}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="mt-3 text-sm text-slate-600">Belum ada peserta.</p>}
                    </details>
                ))}
            </div>
        </section>
    );
}

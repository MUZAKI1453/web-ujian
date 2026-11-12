import { useCallback, useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { IdCard, KeyRound, Printer, RefreshCw } from 'lucide-react';
import api from '../services/api';
import ActionDialog from '../components/ActionDialog';
import StudentPasswordDialog from '../components/StudentPasswordDialog';
import Select from '../components/ui/Select';
import { errorMessage } from './guru/QuestionEditor';

type ClassRow = { id: number; namaKelas: string; jumlah: number; tanpaSandi: number };
type Student = { id: number; username: string; nama: string | null; password: string | null; adaSandi: boolean };
type Sheet = { kelas: { id: number; namaKelas: string }; data: Student[] };

const today = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

// Password siswa dibuat sistem. Admin melihat semua kelas dan dapat membuat password satu kelas sekaligus;
// guru hanya melihat kelas yang diajarnya. Daftar kelas dipegang pengawas, kartu peserta dibagikan ke siswa.
export default function PasswordSiswa({ schoolName }: { schoolName: string }) {
    const [classes, setClasses] = useState<ClassRow[] | null>(null);
    const [admin, setAdmin] = useState(false);
    const [classId, setClassId] = useState('');
    const [sheet, setSheet] = useState<Sheet | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [target, setTarget] = useState<Student | null>(null);
    const [bulk, setBulk] = useState<'kosong' | 'semua' | null>(null);
    const [printing, setPrinting] = useState<'daftar' | 'kartu' | null>(null);

    const loadClasses = useCallback(async (signal?: AbortSignal) => {
        const { data } = await api.get<{ admin: boolean; data: ClassRow[] }>('/akun-siswa/kelas', { signal });
        if (signal?.aborted) return;
        setClasses(data.data); setAdmin(data.admin);
    }, []);
    const loadSheet = useCallback(async (id: string, signal?: AbortSignal) => {
        const { data } = await api.get<Sheet>('/akun-siswa/kelas/' + id, { signal });
        if (!signal?.aborted) setSheet(data);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        loadClasses(controller.signal).catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
        return () => controller.abort();
    }, [loadClasses]);

    useEffect(() => {
        setSheet(null); setNotice(''); setError('');
        if (!classId) return;
        const controller = new AbortController();
        loadSheet(classId, controller.signal).catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
        return () => controller.abort();
    }, [classId, loadSheet]);

    async function refresh() {
        await Promise.all([loadClasses(), classId ? loadSheet(classId) : undefined]);
    }

    async function generate(mode: 'kosong' | 'semua') {
        setBusy(true); setError(''); setNotice('');
        try {
            const { data } = await api.post<{ message: string }>('/akun-siswa/kelas/' + classId + '/buat', { mode });
            await refresh();
            setNotice(data.message);
            setBulk(null);
        } catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    function print(mode: 'daftar' | 'kartu') {
        // Lembar cetak dirender dulu, baru dialog cetak dibuka.
        flushSync(() => setPrinting(mode));
        window.print();
        setPrinting(null);
    }

    const students = sheet?.data ?? [];
    const missing = students.filter(student => !student.password).length;
    const printable = students.filter(student => student.password);
    const className = sheet?.kelas.namaKelas ?? '';

    return <section className="cbt-portal">
        <header className="ui-card space-y-2 p-5 sm:p-8">
            <h1 className="ui-page-title flex items-center gap-2.5"><KeyRound size={28} className="text-blue-600" aria-hidden="true" />Password Siswa</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">Password siswa dibuat oleh sistem dan tidak perlu diganti siswa. Cetak daftar kelas untuk pegangan pengawas,
                atau kartu peserta untuk dibagikan. {admin ? 'Anda melihat semua kelas.' : 'Anda melihat kelas yang Anda ajar.'}</p>
        </header>
        {error && !bulk && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        {notice && <p role="status" className="ui-notice ui-notice-success">{notice}</p>}

        <div className="ui-card space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="ui-label block min-w-0 sm:w-72">Kelas
                    <Select value={classId} disabled={!classes?.length} className="ui-input mt-1 w-full" onValueChange={setClassId}>
                        <option value="">{!classes ? 'Memuat kelas…' : classes.length ? 'Pilih kelas' : 'Belum ada kelas'}</option>
                        {classes?.map(item => <option key={item.id} value={item.id}>
                            {item.namaKelas} · {item.jumlah} siswa{item.tanpaSandi ? ` · ${item.tanpaSandi} belum punya password` : ''}
                        </option>)}
                    </Select>
                </label>
                {sheet && <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!printable.length} className="ui-button ui-button-secondary" onClick={() => print('daftar')}>
                        <Printer size={17} aria-hidden="true" />Cetak daftar kelas</button>
                    <button type="button" disabled={!printable.length} className="ui-button ui-button-secondary" onClick={() => print('kartu')}>
                        <IdCard size={17} aria-hidden="true" />Cetak kartu peserta</button>
                </div>}
            </div>
            {classes && !classes.length && <p className="text-sm text-slate-600">{admin ? 'Buat kelas dan impor siswa terlebih dahulu.' : 'Anda belum ditugaskan mengajar kelas mana pun.'}</p>}
            {classId && !sheet && !error && <p role="status" className="text-sm text-slate-500">Memuat siswa…</p>}

            {sheet && missing > 0 && <div className="ui-notice ui-notice-warning flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{missing} siswa di kelas ini belum punya password dari sekolah dan masih memakai password lamanya.
                    {!admin && ' Minta admin membuatkannya, atau buat satu per satu lewat tombol di tiap baris.'}</span>
                {admin && <button type="button" disabled={busy} className="ui-button ui-button-primary shrink-0" onClick={() => { setError(''); setBulk('kosong'); }}>Buat untuk {missing} siswa</button>}
            </div>}

            {sheet && (students.length ? <div className="overflow-x-auto">
                <table className="ui-table">
                    <thead><tr><th>No</th><th>NIS</th><th>Nama</th><th>Password</th><th className="text-center">Aksi</th></tr></thead>
                    <tbody>{students.map((student, index) => <tr key={student.id}>
                        <td className="text-slate-500">{index + 1}</td>
                        <td className="font-mono font-semibold">{student.username}</td>
                        <td className="font-semibold text-slate-800">{student.nama || '—'}</td>
                        <td>{student.password
                            ? <span className="select-all font-mono text-base font-bold tracking-widest text-slate-900">{student.password}</span>
                            : <span className="text-xs italic text-slate-500">{student.adaSandi ? 'Tidak dapat ditampilkan' : 'Belum dibuat'}</span>}</td>
                        <td className="text-center"><button type="button" className="ui-button ui-button-secondary" onClick={() => setTarget(student)}>
                            <RefreshCw size={15} aria-hidden="true" />{student.password ? 'Ganti' : 'Buat'}</button></td>
                    </tr>)}</tbody>
                </table>
            </div> : <p className="p-6 text-center text-sm text-slate-500">Belum ada siswa di kelas ini.</p>)}

            {sheet && admin && students.length > 0 && <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">Tahun ajaran baru atau daftar password bocor? Buat ulang password seluruh kelas, lalu cetak daftar baru.</p>
                <button type="button" disabled={busy} className="ui-button ui-button-secondary shrink-0" onClick={() => { setError(''); setBulk('semua'); }}>Buat ulang semua password</button>
            </div>}
        </div>

        {target && <StudentPasswordDialog path={'/akun-siswa/siswa/' + target.id} name={target.nama || target.username} nis={target.username}
            onClose={() => setTarget(null)} onChanged={() => void refresh().catch(() => {})} />}

        {bulk && sheet && <ActionDialog tone="warning" pending={busy}
            title={bulk === 'semua' ? 'Buat ulang semua password kelas ' + className + '?' : 'Buat password untuk ' + missing + ' siswa?'}
            message={bulk === 'semua'
                ? `Password ${students.length} siswa diganti. Kartu dan daftar yang sudah dicetak tidak berlaku lagi, dan siswa yang sedang masuk harus login ulang.`
                : 'Password lama yang dibuat sendiri oleh siswa tersebut tidak berlaku lagi, dan siswa yang sedang masuk harus login ulang.'}
            confirmLabel={busy ? 'Membuat…' : 'Buat password'} onClose={() => setBulk(null)} onConfirm={() => void generate(bulk)}>
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        </ActionDialog>}

        {printing && sheet && createPortal(<div className="print-sheet">
            {printing === 'daftar' ? <>
                <h1>{schoolName}</h1>
                <h2>Daftar Akun Siswa · Kelas {className}</h2>
                <p className="print-note">Dicetak {today.format(new Date())}. Dokumen rahasia: dipegang wali kelas atau pengawas, jangan ditempel di kelas.</p>
                <table>
                    <thead><tr><th>No</th><th>NIS (username)</th><th>Nama</th><th>Password</th></tr></thead>
                    <tbody>{printable.map((student, index) => <tr key={student.id}>
                        <td>{index + 1}</td><td className="print-mono">{student.username}</td><td>{student.nama}</td><td className="print-mono">{student.password}</td>
                    </tr>)}</tbody>
                </table>
            </> : <div className="print-cards">{printable.map(student => <article key={student.id}>
                <p className="print-school">{schoolName}</p>
                <p className="print-title">Kartu Peserta Ujian</p>
                <dl>
                    <dt>Nama</dt><dd>{student.nama}</dd>
                    <dt>Kelas</dt><dd>{className}</dd>
                    <dt>Username</dt><dd className="print-mono">{student.username}</dd>
                    <dt>Password</dt><dd className="print-mono">{student.password}</dd>
                </dl>
                <p className="print-note">Jangan berikan kartu ini kepada orang lain.</p>
            </article>)}</div>}
        </div>, document.body)}
    </section>;
}

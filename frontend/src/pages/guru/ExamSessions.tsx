import { FormEvent, useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { errorMessage, fieldClass, primaryClass } from './QuestionEditor';

type Student = { id: number; nama: string | null; username: string };
type Window = { token: string | null; masukBuka: boolean; waktuMulai: string; waktuSelesai: string };
type Makeup = Window & { id: number; peserta: { siswaId: number; siswa: Student }[] };
type Attempt = { id: number; siswaId: number; sesiSusulanId: number | null; mulai: string; batasWaktu: string; waktuKirim: string | null; siswa: Student };
type Answer = { siswaId: number; totalNilai: string; waktuSubmit: string; siswa: Student };
type Sessions = Window & { kelas: { users: Student[] }; susulan: Makeup[]; pengerjaan: Attempt[]; jawaban: Answer[] };

const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const formatted = (value: string) => date.format(new Date(value));

export default function ExamSessions({ examId }: { examId: number }) {
    const [data, setData] = useState<Sessions | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [making, setMaking] = useState(false);
    const [projection, setProjection] = useState<string | null>(null);
    const url = '/guru/ujian/' + examId;
    const refresh = useCallback(async (signal?: AbortSignal) => {
        const response = await api.get<Sessions>(url + '/sesi', { signal, timeout: 10000 });
        if (!signal?.aborted) setData(response.data);
    }, [url]);

    useEffect(() => {
        const controller = new AbortController();
        let next: ReturnType<typeof setTimeout>;
        async function poll() {
            try { await refresh(controller.signal); }
            catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
            if (!controller.signal.aborted) next = setTimeout(poll, 15000);
        }
        void poll();
        return () => { controller.abort(); clearTimeout(next); };
    }, [refresh]);

    async function perform(action: () => Promise<unknown>) {
        setBusy(true);
        setError('');
        try { await action(); await refresh(); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
    }

    function makeup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void perform(async () => {
            await api.post(url + '/susulan', {
                waktuMulai: new Date(String(form.get('mulai'))).toISOString(),
                waktuSelesai: new Date(String(form.get('selesai'))).toISOString(),
                peserta: form.getAll('peserta').map(Number)
            });
            setMaking(false);
        });
    }

    if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Memuat sesi ujian…'}</p>;
    const now = Date.now();
    const attempts = new Map(data.pengerjaan.map(item => [item.siswaId, item]));
    const answers = new Map(data.jawaban.map(item => [item.siswaId, item]));
    const assigned = new Set(data.susulan.flatMap(item => item.peserta.map(p => p.siswaId)));
    const regular = new Map(data.kelas.users.filter(item => !assigned.has(item.id)).map(item => [item.id, item]));
    data.pengerjaan.filter(item => item.sesiSusulanId === null).forEach(item => regular.set(item.siswaId, item.siswa));
    data.jawaban.filter(item => attempts.get(item.siswaId)?.sesiSusulanId == null).forEach(item => regular.set(item.siswaId, item.siswa));
    const eligible = data.kelas.users.filter(item => !assigned.has(item.id) && !attempts.has(item.id) && !answers.has(item.id));
    const sessions = [
        { ...data, key: 'reguler', title: 'Sesi reguler', id: null, students: [...regular.values()] },
        ...data.susulan.map((item, index) => ({ ...item, key: String(item.id), title: 'Sesi susulan ' + (index + 1), students: item.peserta.map(p => p.siswa) }))
    ];

    const projected = sessions.find(session => session.key === projection);
    return <section className="space-y-4 rounded-xl border p-4">
        {projected && <dialog ref={element => { if (element && !element.open) element.showModal(); }}
            onCancel={event => { event.preventDefault(); setProjection(null); }}
            className="w-[min(95vw,50rem)] rounded-2xl p-8 text-center backdrop:bg-slate-950/80" aria-label="Token ujian">
            <p className="font-semibold">{projected.title}</p>
            <p className="my-6 font-mono text-[clamp(2rem,12vw,7rem)] font-bold tracking-wider">{projected.token}</p>
            <button type="button" className={primaryClass} onClick={() => setProjection(null)}>Tutup</button>
        </dialog>}
        <h2 className="font-semibold">Sesi dan pengerjaan</h2>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {sessions.map(session => {
            const ongoing = +new Date(session.waktuSelesai) > now;
            const status = !ongoing ? 'Selesai' : +new Date(session.waktuMulai) > now ? 'Terjadwal' : 'Berlangsung';
            const controls = (aksi: string, ask?: string) => {
                if (ask && !confirm(ask)) return;
                void perform(() => api.patch(url + '/sesi/' + session.key, { aksi }));
            };
            return <div key={session.key} className="space-y-2 rounded-xl bg-slate-50 p-4">
                <h3 className="font-semibold">{session.title} · {status}</h3>
                <p className="text-sm">{formatted(session.waktuMulai)} s.d. {formatted(session.waktuSelesai)}</p>
                <p className="text-sm">Token <strong className="ml-1 font-mono text-xl tracking-widest">{session.token || '—'}</strong> · {session.masukBuka && ongoing ? 'Masuk dibuka' : 'Masuk ditutup'}</p>
                {ongoing && <div className="flex flex-wrap gap-2 text-sm text-blue-700">
                    {session.token && <button type="button" onClick={() => setProjection(session.key)}>Proyeksikan token</button>}
                    <button type="button" disabled={busy} onClick={() => controls('ganti-token')}>Ganti token</button>
                    <button type="button" disabled={busy} onClick={() => controls(session.masukBuka ? 'tutup' : 'buka')}>{session.masukBuka ? 'Tutup akses masuk' : 'Buka akses masuk'}</button>
                    {status === 'Berlangsung' && <button type="button" disabled={busy} className="text-red-700"
                        onClick={() => controls('akhiri', 'Akhiri sesi ini sekarang?')}>Akhiri sesi</button>}
                </div>}
                <details>
                    <summary className="cursor-pointer text-sm font-semibold">{session.students.length} peserta</summary>
                    <div className="overflow-x-auto">
                        <table className="mt-2 w-full text-left text-sm">
                            <thead><tr>{['Siswa', 'Status', 'Nilai tercatat', 'Aksi'].map(label => <th scope="col" className="p-2" key={label}>{label}</th>)}</tr></thead>
                            <tbody>{session.students.map(student => {
                                const attempt = attempts.get(student.id);
                                const attemptHere = attempt?.sesiSusulanId === session.id ? attempt : undefined;
                                const answer = (attempt?.sesiSusulanId ?? null) === session.id ? answers.get(student.id) : undefined;
                                const state = attemptHere?.waktuKirim || answer ? 'Sudah mengirim' : attemptHere
                                    ? Math.min(+new Date(attemptHere.batasWaktu), +new Date(session.waktuSelesai)) <= now ? 'Waktu habis' : 'Mengerjakan'
                                    : 'Belum mulai';
                                return <tr key={student.id} className="border-t">
                                    <td className="p-2">{student.nama || student.username}</td><td className="p-2">{state}</td>
                                    <td className="p-2">{answer?.totalNilai ?? '—'}</td>
                                    <td className="p-2">{(attemptHere || answer) && <button type="button" disabled={busy} className="text-red-700"
                                        onClick={() => { if (confirm('Reset pengerjaan dan hapus jawaban peserta ini?')) void perform(() => api.delete(url + '/pengerjaan/' + student.id)); }}>Reset</button>}</td>
                                </tr>;
                            })}</tbody>
                        </table>
                    </div>
                </details>
            </div>;
        })}
        <button type="button" disabled={busy || !eligible.length} className={primaryClass} onClick={() => setMaking(value => !value)}>{making ? 'Tutup Form Susulan' : 'Tambah Sesi Susulan'}</button>
        {!eligible.length && <p className="text-sm text-slate-600">Belum ada peserta yang bisa ditambahkan ke sesi susulan.</p>}
        {making && <form onSubmit={makeup} className="space-y-3 rounded-xl border p-4">
            <label className="block text-sm">Mulai<input type="datetime-local" name="mulai" required className={fieldClass} /></label>
            <label className="block text-sm">Selesai<input type="datetime-local" name="selesai" required className={fieldClass} /></label>
            <fieldset className="max-h-40 space-y-1 overflow-auto">
                <legend className="text-sm font-semibold">Pilih peserta</legend>
                {eligible.map(student => <label key={student.id} className="block text-sm">
                    <input type="checkbox" name="peserta" value={student.id} /> {student.nama || student.username} · {student.username}
                </label>)}
            </fieldset>
            <button type="submit" disabled={busy} className={primaryClass}>Simpan Sesi Susulan</button>
        </form>}
    </section>;
}

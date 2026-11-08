import { useState, type FormEvent } from 'react';
import { BookOpen, Clock3, FilePenLine, GraduationCap, Save } from 'lucide-react';
import ClassPicker from '../../components/ClassPicker';
import { fieldClass, primaryClass } from '../../components/ui/styles';
import api from '../../services/api';
import { errorMessage } from './QuestionEditor';
import type { ExamDetail, ExamRow, ExamType } from './UjianGuru';
import DraftExamSettings, { readDraftRules } from './DraftExamSettings';
import { defaultExamSchedule } from './examDateFilter';

type Assignment = { mapel: { id: number; nama: string }; kelas: { id: number; namaKelas: string } };

export default function DraftExamForm({ assignments, examTypes, source, onCreated }: {
    assignments: Assignment[];
    examTypes: ExamType[];
    source?: ExamDetail;
    onCreated: (exam: ExamRow & { soal?: ExamDetail['soal'] }) => void;
}) {
    const subjects = [...new Map(assignments.map(pair => [pair.mapel.id, pair.mapel])).values()];
    const [subject, setSubject] = useState(source ? String(source.mapel.id) : subjects.length === 1 ? String(subjects[0].id) : '');
    const [classes, setClasses] = useState<number[]>([]);
    const [schedule] = useState(() => defaultExamSchedule(source?.durasiMenit));
    const [typeId, setTypeId] = useState(String(examTypes.find(item => item.id === source?.jenisUjianId)?.id ?? ''));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const available = [...new Map(assignments.filter(pair => String(pair.mapel.id) === subject).map(pair => [pair.kelas.id, pair.kelas])).values()];
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;
        setError('');
        if (!classes.length) { setError('Pilih minimal satu kelas tujuan.'); return; }
        const form = new FormData(event.currentTarget);
        const start = new Date(String(form.get('mulai')));
        const end = new Date(String(form.get('selesai')));
        const duration = Number(form.get('durasi'));
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end - +start < duration * 60000) {
            setError('Rentang jadwal harus cukup untuk durasi ujian.'); return;
        }
        setSaving(true);
        try {
            const url = source ? '/guru/ujian/' + source.id + '/duplikat' : '/guru/ujian';
            const { data } = await api.post<ExamRow & { soal?: ExamDetail['soal'] }>(url, { jenisUjianId: Number(form.get('jenisUjianId')), mapelId: Number(subject), kelasIds: classes,
                durasiMenit: duration, waktuMulai: start.toISOString(), waktuSelesai: end.toISOString(),
                aturanDraf: readDraftRules(form) });
            onCreated(data);
        } catch (err) { setError(errorMessage(err)); }
        finally { setSaving(false); }
    }
    return <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        <fieldset disabled={saving} className="space-y-4">
            <section className="ui-card grid gap-5 bg-white p-5 sm:p-6 lg:grid-cols-2">
                <h2 className="flex items-center gap-2 font-semibold lg:col-span-2"><GraduationCap size={20} className="text-blue-600" aria-hidden="true" />Mapel & Kelas</h2>
                <fieldset className="min-w-0 space-y-3">
                    <legend className="sr-only">Pilih mapel</legend>
                    <div className="grid max-h-72 gap-2 overflow-y-auto p-1 sm:grid-cols-2">
                        {subjects.map(item => {
                            const active = subject === String(item.id);
                            const assignedClasses = [...new Map(assignments.filter(pair => pair.mapel.id === item.id).map(pair => [pair.kelas.id, pair.kelas])).values()];
                            return <label key={item.id} className={'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-blue-500 ' + (active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50')}>
                                <span className={'grid size-9 shrink-0 place-items-center rounded-lg ' + (active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500')}><BookOpen size={18} aria-hidden="true" /></span>
                                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-800">{item.nama}</span>
                                    <span className="mt-2 flex flex-wrap gap-1">{assignedClasses.slice(0, 4).map(kelas => <span key={kelas.id} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">{kelas.namaKelas}</span>)}{assignedClasses.length > 4 && <span className="text-xs text-slate-500">+{assignedClasses.length - 4} kelas</span>}</span>
                                </span>
                                <input type="radio" name="mapelId" required value={item.id} checked={active} className="mt-1 size-4 shrink-0 accent-blue-600" onChange={() => { setSubject(String(item.id)); setClasses([]); setError(''); }} />
                            </label>;
                        })}
                    </div>
                </fieldset>
                <div className="min-w-0">{subject ? <ClassPicker classes={available} selected={classes} onChange={setClasses} label="Kelas tujuan" /> :
                    <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Pilih mata pelajaran untuk melihat kelas tujuan.</div>}</div>
            </section>
            <section className="ui-card space-y-5 bg-white p-5 sm:p-6">
                <h2 className="flex items-center gap-2 font-semibold"><FilePenLine size={20} className="text-blue-600" aria-hidden="true" />Detail Ujian</h2>
                <label className="ui-label block">Jenis ujian
                    <select name="jenisUjianId" required value={typeId} onChange={event => setTypeId(event.target.value)} className={fieldClass}>
                        <option value="" disabled>Pilih jenis ujian</option>
                        {examTypes.map(item => <option key={item.id} value={item.id}>{item.nama}</option>)}
                    </select>
                </label>
                {!examTypes.length && <p role="status" className="ui-notice">Belum ada jenis ujian. Hubungi admin untuk menambahkannya melalui Data Master → Jenis Ujian.</p>}
                <div className="grid gap-4 lg:grid-cols-3">
                    <label className="ui-label block">Waktu mulai<input name="mulai" type="datetime-local" defaultValue={schedule.start} required className={fieldClass} /></label>
                    <label className="ui-label block">Waktu selesai<input name="selesai" type="datetime-local" defaultValue={schedule.end} required className={fieldClass} /></label>
                <label className="ui-label block"><span className="flex items-center gap-1.5"><Clock3 size={15} aria-hidden="true" />Durasi</span>
                    <span className="mt-1 flex min-h-11 items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-visible:ring-blue-100">
                        <input name="durasi" type="number" min="1" step="1" defaultValue={source?.durasiMenit ?? 120} required className="min-h-11 min-w-0 flex-1 border-0 px-3 py-2.5 text-sm" /><span className="self-stretch border-l border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-normal text-slate-500">menit</span>
                    </span>
                </label>
                </div>
                <DraftExamSettings exam={source} />
            </section>
            <div className="flex justify-end rounded-xl border border-slate-200 bg-white p-4">
                <button type="submit" disabled={!subject || !classes.length || !examTypes.length} className={primaryClass}><Save size={18} aria-hidden="true" />{saving ? 'Menyimpan…' : source ? 'Buat Salinan Draf' : 'Simpan Draf'}</button>
            </div>
        </fieldset>
    </form>;
}

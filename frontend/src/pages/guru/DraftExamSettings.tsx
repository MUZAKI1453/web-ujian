import Select from '../../components/ui/Select';
import { gradeDestinationLabels } from './examProfiles';
import type { ExamDetail } from './UjianGuru';

export function readDraftRules(form: FormData) {
    return {
        token: form.get('modeToken'),
        rekap: form.get('tujuanRekap'),
        hasilOtomatis: form.has('rilisHasilOtomatis'),
        pembahasanOtomatis: form.has('rilisPembahasanOtomatis'),
        acakSoal: form.has('acakSoal'),
        acakOpsi: form.has('acakOpsi')
    };
}

const tokenOptions = [
    { value: 'wajib', label: 'Wajib', description: 'Token dibuat saat ujian terbit.' },
    { value: 'opsional', label: 'Opsional', description: 'Guru bisa mengaktifkan token per sesi.' },
    { value: 'tanpa', label: 'Tanpa token', description: 'Siswa masuk saat akses sesi dibuka.' }
];

export default function DraftExamSettings({ exam }: { exam?: ExamDetail }) {
    const token = exam?.profil === 'latihan-kuis' ? 'tanpa' : exam?.profil === 'ulangan-harian' ? 'opsional' : 'wajib';
    const releaseOptions = [
        { name: 'rilisHasilOtomatis', label: 'Rilis nilai otomatis', description: 'Siswa melihat nilai setelah penilaian selesai.', checked: exam?.draf && exam.hasilRilis },
        { name: 'rilisPembahasanOtomatis', label: 'Buka pembahasan otomatis', description: 'Pembahasan tersedia setelah sesi utama dan semua susulan selesai.', checked: exam?.draf && exam.bahasanRilis }
    ];
    const shuffleOptions = [
        { name: 'acakSoal', label: 'Acak urutan soal', description: 'Tiap siswa mendapat urutan berbeda. Soal hanya bertukar dengan soal bertipe sama.', checked: exam?.acakSoal ?? true },
        { name: 'acakOpsi', label: 'Acak urutan opsi', description: 'Berlaku untuk pilihan ganda dan pilihan majemuk. Matikan bila ada opsi seperti "Semua benar" atau "A dan B benar".', checked: exam?.acakOpsi ?? true }
    ];
    return <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">Aturan ujian</legend>
        <fieldset>
            <legend className="ui-label mb-2">Token masuk</legend>
            <div className="grid gap-2 sm:grid-cols-3">
                {tokenOptions.map(option => <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3">
                    <input type="radio" name="modeToken" value={option.value} defaultChecked={token === option.value} className="mt-1 size-4 shrink-0" />
                    <span><span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                        <span className="mt-1 block text-xs text-slate-600">{option.description}</span>
                    </span>
                </label>)}
            </div>
        </fieldset>
        <div>
            <label htmlFor="draft-grade-destination" className="ui-label mb-1 block">Tujuan rekap</label>
            <Select id="draft-grade-destination" name="tujuanRekap" defaultValue={exam?.tujuanRekap ?? 'buku-nilai'}>
                {Object.entries(gradeDestinationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
            {[...shuffleOptions, ...releaseOptions].map(option => <label key={option.name} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input type="checkbox" name={option.name} defaultChecked={option.checked} className="mt-1 size-4 shrink-0" />
                <span><span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                    <span className="mt-1 block text-xs text-slate-600">{option.description}</span>
                </span>
            </label>)}
        </div>
    </fieldset>;
}

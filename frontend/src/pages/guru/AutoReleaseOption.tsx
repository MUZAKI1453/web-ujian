export default function AutoReleaseOption({ defaultChecked = false }: { defaultChecked?: boolean }) {
    return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <input type="checkbox" name="rilisHasilOtomatis" defaultChecked={defaultChecked} className="mt-1 size-4 shrink-0 accent-blue-600" />
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">Rilis hasil otomatis</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-600">Siswa dapat melihat nilai begitu penilaian selesai. Pembahasan dirilis secara terpisah.</span>
        </span>
    </label>;
}

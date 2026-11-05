export default function ClassPicker({ classes, selected, onChange, label = 'Kelas tujuan', disabled, unavailable }: {
    classes: { id: number; namaKelas: string }[];
    selected: number[];
    onChange: (ids: number[]) => void;
    label?: string;
    disabled?: boolean;
    unavailable?: (id: number) => boolean;
}) {
    const available = classes.filter(item => !unavailable?.(item.id)).map(item => item.id);
    return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">{selected.length} kelas dipilih</span>
            <div className="flex gap-3">
                <button type="button" disabled={disabled || !available.length} onClick={() => onChange(available)} className="font-semibold text-blue-600 disabled:opacity-40">Pilih semua</button>
                <button type="button" disabled={disabled || !selected.length} onClick={() => onChange([])} className="text-slate-500 disabled:opacity-40">Kosongkan</button>
            </div>
        </div>
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto p-1">
            {classes.map(item => {
                const blocked = !!unavailable?.(item.id);
                const checked = selected.includes(item.id);
                return <label key={item.id} title={blocked ? 'Kelas ini sudah dipilih atau diampu guru lain.' : undefined}
                    className={'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ' + (blocked ? 'cursor-not-allowed bg-slate-100 text-slate-400' : checked ? 'cursor-pointer border-blue-600 bg-blue-50 font-semibold text-blue-700' : 'cursor-pointer border-slate-200 hover:border-blue-300')}>
                    <input type="checkbox" checked={checked} disabled={blocked} onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />
                    {item.namaKelas}
                </label>;
            })}
        </div>
        {!classes.length && <p className="text-xs text-slate-500">Belum ada kelas yang tersedia untuk mata pelajaran ini.</p>}
    </fieldset>;
}

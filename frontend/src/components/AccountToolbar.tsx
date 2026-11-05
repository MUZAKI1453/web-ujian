import { Plus, Trash2, UploadCloud } from 'lucide-react';

export default function AccountToolbar({ role, selectedCount, onDelete, onImport, onAdd }: {
    role: 'siswa' | 'guru' | 'kelas' | 'mapel'; selectedCount: number; onDelete: () => void; onImport?: () => void; onAdd: () => void;
}) {
    return <div role="group" aria-label={'Tindakan data ' + role} className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
        <button type="button" disabled={!selectedCount} onClick={onDelete} className="ui-button ui-button-danger"
            aria-label={'Hapus ' + selectedCount + ' data ' + role + ' terpilih'}>
            <Trash2 size={18} aria-hidden="true" />Hapus
        </button>
        {onImport && <button type="button" onClick={onImport} className="ui-button ui-button-success">
            <UploadCloud size={18} aria-hidden="true" />Import
        </button>}
        <button type="button" onClick={onAdd} className="ui-button ui-button-primary">
            <Plus size={18} aria-hidden="true" />Tambah
        </button>
    </div>;
}

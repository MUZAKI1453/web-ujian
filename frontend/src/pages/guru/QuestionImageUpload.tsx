import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fieldClass } from '../../components/ui/styles';
import QuestionContent from './QuestionContent';

export default function QuestionImageUpload({ label, fieldLabel, heading, headerAction, inputAction, children, value, onChange, onReadingChange }: {
    label: string; value: string; onChange: (image: string) => void; onReadingChange: (delta: number) => void;
    fieldLabel: string; children: (inputId: string) => ReactNode;
    heading?: ReactNode; headerAction?: ReactNode; inputAction?: ReactNode;
}) {
    const id = useId();
    const [enabled, setEnabled] = useState(Boolean(value));
    const [draft, setDraft] = useState(value);
    const [error, setError] = useState('');
    const [reading, setReading] = useState(false);
    const reader = useRef<FileReader | null>(null);

    useEffect(() => () => { reader.current?.abort(); }, []);

    function upload(file: File | undefined) {
        if (!file) return;
        setError('');
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 512 * 1024) {
            setError('Pilih gambar PNG, JPG, WebP, atau GIF maksimal 512 KB.');
            return;
        }
        reader.current?.abort();
        const next = new FileReader();
        reader.current = next;
        next.onload = () => {
            if (reader.current !== next) return;
            const image = String(next.result);
            setDraft(image);
            onChange(image);
        };
        next.onerror = () => setError('Gambar gagal dibaca. Silakan unggah ulang.');
        next.onloadend = () => {
            if (reader.current === next) {
                reader.current = null;
                setReading(false);
            }
            onReadingChange(-1);
        };
        setReading(true);
        onReadingChange(1);
        next.readAsDataURL(file);
    }

    return <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
            {heading}
            <label htmlFor={id + '-text'} className={heading ? 'sr-only' : 'ui-label min-w-0'}>{fieldLabel}</label>
            <div className="flex shrink-0 items-center gap-2">
                <label htmlFor={id} className="cursor-pointer text-xs font-medium text-slate-600">{label}</label>
                <button id={id} type="button" role="switch" aria-checked={enabled} aria-controls={id + '-upload'}
                    className={'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ' + (enabled ? 'bg-blue-600' : 'bg-slate-300')}
                    onClick={() => {
                        reader.current?.abort();
                        setEnabled(!enabled);
                        setError('');
                        onChange(enabled ? '' : draft);
                    }}>
                    <span className={'size-4 rounded-full bg-white shadow-sm transition-transform ' + (enabled ? 'translate-x-6' : 'translate-x-1')} />
                </button>
                {headerAction}
            </div>
        </div>
        <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">{children(id + '-text')}</div>
            {inputAction}
        </div>
        {enabled && <div id={id + '-upload'} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <label className="ui-label block">Unggah {label.toLowerCase()}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={reading}
                    aria-describedby={id + '-help'} className={fieldClass}
                    onChange={event => {
                        upload(event.target.files?.[0]);
                        event.target.value = '';
                    }} />
            </label>
            <p id={id + '-help'} className="text-xs text-slate-500">PNG, JPG, WebP, atau GIF. Maksimal 512 KB.</p>
            {reading && <p role="status" className="text-sm text-slate-600">Membaca gambar…</p>}
            {value && <QuestionContent text="" image={value} />}
            {error && <p role="alert" className="ui-notice ui-notice-error">{error}</p>}
        </div>}
    </div>;
}

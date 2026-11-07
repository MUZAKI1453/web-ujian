import { ClipboardList } from 'lucide-react';

export default function ExamTypeBadge({ label, inverse = false }: { label: string; inverse?: boolean }) {
    return <span aria-label={'Jenis ujian: ' + label}
        className={'ui-badge inline-flex max-w-full items-start gap-1.5 whitespace-normal text-left ' +
            (inverse ? 'bg-white/15 text-white' : 'bg-blue-50 text-blue-700')}>
        <ClipboardList size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{label}</span>
    </span>;
}

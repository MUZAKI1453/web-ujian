import ActionDialog from './ActionDialog';

export default function AlertDialog({ title = 'Perhatian', message, onClose }: {
    title?: string; message: string; onClose: () => void;
}) {
    const [summary = '', ...details] = message.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return <ActionDialog title={title} message={summary} tone="warning" confirmLabel="Mengerti" onClose={onClose}>
        {details.length > 0 && <ul className="max-h-64 list-disc space-y-2 overflow-y-auto rounded-xl border border-yellow-200 bg-yellow-50 py-3 pl-8 pr-4 text-sm leading-relaxed text-slate-700">
            {details.map((line, index) => <li key={index} className="break-words">{line}</li>)}
        </ul>}
    </ActionDialog>;
}

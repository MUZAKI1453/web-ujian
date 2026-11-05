import { CheckCircle2 } from 'lucide-react';
import ModalOverlay from './ModalOverlay';

export default function SuccessDialog({ title, message, onClose }: {
    title: string; message: string; onClose: () => void;
}) {
    return <ModalOverlay onClose={onClose}>
        <section role="dialog" aria-modal="true" aria-labelledby="success-dialog-title" className="ui-dialog-panel max-w-sm space-y-4 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 size={24} aria-hidden="true" /></span>
            <div className="space-y-2"><h2 id="success-dialog-title" className="text-xl font-bold">{title}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{message}</p></div>
            <button type="button" className="ui-button ui-button-primary w-full" onClick={onClose}>Tutup</button>
        </section>
    </ModalOverlay>;
}

import { useId, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Trash2 } from 'lucide-react';
import ModalOverlay from './ModalOverlay';

const appearances = {
    info: { icon: CircleHelp, badge: 'bg-blue-50 text-blue-700', button: 'ui-button-primary' },
    warning: { icon: AlertTriangle, badge: 'bg-yellow-100 text-yellow-900', button: 'ui-button-primary' },
    danger: { icon: Trash2, badge: 'bg-red-50 text-red-700', button: 'ui-button-danger' },
    success: { icon: CheckCircle2, badge: 'bg-emerald-50 text-emerald-700', button: 'ui-button-success' }
};

export type ActionPrompt = { title: string; message?: ReactNode; confirmLabel: string; tone?: keyof typeof appearances; cancelLabel?: string };

export default function ActionDialog({ title, message, confirmLabel, tone = 'info', cancelLabel = 'Batal',
    children, onClose, onConfirm, pending = false }: ActionPrompt & {
    children?: ReactNode; onClose: () => void; onConfirm?: () => void; pending?: boolean;
}) {
    const id = useId();
    const { icon: Icon, badge, button } = appearances[tone];
    return <ModalOverlay onClose={() => { if (!pending) onClose(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={message ? id + '-message' : undefined}
            className="ui-dialog-panel max-w-lg space-y-4">
            <div className="flex items-start gap-3">
                <span className={'grid size-11 shrink-0 place-items-center rounded-xl ' + badge}><Icon size={22} aria-hidden="true" /></span>
                <div className="min-w-0 space-y-1">
                    <h2 id={id + '-title'} className="break-words text-lg font-bold text-slate-900">{title}</h2>
                    {message && <div id={id + '-message'} className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-600">{message}</div>}
                </div>
            </div>
            {children}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                {onConfirm && <button type="button" disabled={pending} className="ui-button ui-button-secondary flex-1 sm:flex-none" onClick={onClose}>{cancelLabel}</button>}
                <button type="button" disabled={pending} className={'ui-button flex-1 sm:flex-none ' + button} onClick={onConfirm ?? onClose}>{confirmLabel}</button>
            </div>
        </section>
    </ModalOverlay>;
}

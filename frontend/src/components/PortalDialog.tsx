import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function PortalDialog({ titleId, onClose, children }: {
    titleId: string; onClose: () => void; children: ReactNode;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const elements = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
        (elements()[0] ?? panel.current)?.focus();
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); close.current(); }
            if (event.key !== 'Tab') return;
            const focusable = elements();
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!first) { event.preventDefault(); panel.current?.focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', keydown);
            previous?.focus();
        };
    }, []);
    return createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="my-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">{children}</div>
    </div>, document.body);
}

import { useEffect, useRef, type RefObject } from 'react';

let openDialogs = 0;
let previousOverflow = '';

export function useDialogFocus(panel: RefObject<HTMLElement>, onClose?: () => void) {
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        if (openDialogs++ === 0) {
            previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        ) ?? []).filter(element => !element.matches('[tabindex="-1"], [aria-hidden="true"]') && element.getClientRects().length > 0);
        (focusable()[0] ?? panel.current)?.focus();
        const keydown = (event: KeyboardEvent) => {
            const layers = document.querySelectorAll('[data-dialog-layer]');
            if (layers[layers.length - 1] !== panel.current) return;
            if (event.key === 'Escape' && close.current) {
                event.preventDefault(); event.stopPropagation(); close.current();
            }
            if (event.key !== 'Tab') return;
            const elements = focusable();
            const first = elements[0], last = elements[elements.length - 1];
            if (!first) { event.preventDefault(); panel.current?.focus(); }
            else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', keydown);
        return () => {
            document.removeEventListener('keydown', keydown);
            if (--openDialogs === 0) document.body.style.overflow = previousOverflow;
            if (previous?.isConnected) previous.focus();
        };
    }, [panel]);
}

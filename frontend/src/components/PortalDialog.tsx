import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from './ui/useDialogFocus';

export default function PortalDialog({ titleId, onClose, children }: {
    titleId: string; onClose: () => void; children: ReactNode;
}) {
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, onClose);
    return createPortal(<div className="ui-dialog-overlay z-[80]">
        <div ref={panel} data-dialog-layer role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            className="ui-dialog-panel max-w-lg outline-none">{children}</div>
    </div>, document.body);
}

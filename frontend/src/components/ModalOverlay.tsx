import { isValidElement, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from './ui/useDialogFocus';

export default function ModalOverlay({ children, label = 'Form data', onClose }: {
    children: ReactNode; label?: string; onClose?: () => void;
}) {
    const panel = useRef<HTMLDivElement>(null);
    useDialogFocus(panel, onClose);
    const childIsDialog = isValidElement<{ role?: string }>(children) && children.props.role === 'dialog';
    return createPortal(
        <div className="ui-dialog-overlay z-[90]">
            <div ref={panel} data-dialog-layer tabIndex={-1} role={childIsDialog ? undefined : 'dialog'}
                aria-modal={childIsDialog ? undefined : true} aria-label={childIsDialog ? undefined : label}
                className="my-auto flex w-full shrink-0 justify-center outline-none">
                {children}
            </div>
        </div>, document.body
    );
}

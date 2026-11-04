import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function ModalOverlay({ children }: { children: ReactNode }) {
    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto overscroll-contain bg-slate-900/25 p-4">
            <div className="my-auto flex shrink-0 justify-center">
                {children}
            </div>
        </div>,
        document.body
    );
}

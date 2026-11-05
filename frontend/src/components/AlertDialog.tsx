import ModalOverlay from './ModalOverlay';

interface Props {
    title?: string;
    message: string;
    onClose: () => void;
}

export default function AlertDialog({ title = 'Perhatian', message, onClose }: Props) {
    return (
        <ModalOverlay>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                <section role="dialog" aria-modal="true" aria-labelledby="alert-dialog-title"
                         className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl border border-gray-100 text-center">

                    {/* Icon Peringatan Merah */}
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>

                    <div className="space-y-1">
                        <h3 id="alert-dialog-title" className="text-lg font-bold text-gray-800">
                            {title}
                        </h3>
                        <p className="text-sm text-gray-500">
                            {message}
                        </p>
                    </div>

                    <div className="pt-2">
                        <button
                            type="button"
                            autoFocus
                            onClick={onClose}
                            className="w-full rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/25 hover:bg-red-700 transition"
                        >
                            Tutup
                        </button>
                    </div>
                </section>
            </div>
        </ModalOverlay>
    );
}
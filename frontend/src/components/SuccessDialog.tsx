interface Props {
    title: string;
    message: string;
    onClose: () => void;
}

export default function SuccessDialog({ title, message, onClose }: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <section role="dialog" aria-modal="true" aria-labelledby="success-dialog-title"
                     className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl border border-gray-100 text-center">

                {/* Icon Sukses Centang Hijau */}
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <div className="space-y-1">
                    <h3 id="success-dialog-title" className="text-lg font-bold text-gray-800">
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
                        className="w-full rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 transition"
                    >
                        OK
                    </button>
                </div>
            </section>
        </div>
    );
}
import ExamTypeBadge from '../../components/ExamTypeBadge';

export type Receipt = {
    id: string; title: string; mapel?: string; receivedAt: string; state: 'submitted' | 'review';
    total: number; answered: number; partial: number; missing: number;
};

export default function SubmissionReceipt({ receipt }: { receipt: Receipt }) {
    return <section aria-label="Bukti pengumpulan" className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left text-sm">
        <h2 className="font-bold text-blue-900">Bukti pengumpulan</h2>
        <p className="break-words font-semibold">{receipt.mapel ?? receipt.title}</p>
        {receipt.mapel && <ExamTypeBadge label={receipt.title} />}
        <dl className="grid grid-cols-2 gap-2">
            <dt>Nomor bukti</dt><dd className="break-words text-right">{receipt.id}</dd>
            <dt>Diterima server</dt><dd className="text-right">{new Date(receipt.receivedAt).toLocaleString('id-ID')}</dd>
            <dt>Terjawab lengkap</dt><dd className="text-right">{receipt.answered} / {receipt.total}</dd>
            <dt>Belum lengkap / kosong</dt><dd className="text-right">{receipt.partial} / {receipt.missing}</dd>
        </dl>
        <p className="font-semibold">{receipt.state === 'review' ? 'Menunggu tinjauan guru atas kiriman setelah batas waktu.' : 'Sudah dikumpulkan. Jawaban diterima server.'}</p>
        <p className="text-xs text-slate-600">Bukti ini dapat dibuka kembali dari menu Hasil Ujian.</p>
    </section>;
}

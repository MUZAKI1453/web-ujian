import { useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';

export default function QuestionOrderList({ rows, onMove, onOpen }: {
    rows: { key: number; number: number; text: string }[];
    onMove: (source: number, target: number) => void;
    onOpen: (key: number) => void;
}) {
    const list = useRef<HTMLOListElement>(null);
    const [drag, setDrag] = useState<{ source: number; target: number } | null>(null);
    const handleClass = 'grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-25';

    function targetAt(event: PointerEvent<HTMLButtonElement>) {
        const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-order-key]');
        return row && list.current?.contains(row) ? Number(row.dataset.orderKey) : null;
    }

    return <section className="ui-card space-y-3 border bg-white p-4">
        <div>
            <h2 className="font-semibold text-slate-900">Urutan soal</h2>
            <p className="text-sm text-slate-600">Tarik pegangan atau gunakan panah untuk memindahkan soal dalam tipe ini.</p>
        </div>
        <ol ref={list} className="space-y-1.5">
            {rows.map((row, index) => (
                <li key={row.key} data-order-key={row.key} className={'flex min-w-0 items-center gap-1 rounded-xl border p-1.5 sm:gap-2 ' +
                    (drag?.target === row.key && drag.source !== row.key ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                        : drag?.source === row.key ? 'border-blue-200 bg-slate-100' : 'border-slate-200 bg-white')}>
                    <button type="button" tabIndex={-1} aria-label={'Tarik soal ' + row.number}
                        className={handleClass + ' touch-none select-none cursor-grab active:cursor-grabbing'}
                        onPointerDown={event => {
                            if (!event.isPrimary || event.button !== 0) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDrag({ source: row.key, target: row.key });
                        }}
                        onPointerMove={event => {
                            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                            const target = targetAt(event) ?? row.key;
                            setDrag(current => current?.target === target ? current : { source: row.key, target });
                        }}
                        onPointerUp={event => {
                            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                            const target = targetAt(event);
                            setDrag(null);
                            if (target !== null) onMove(row.key, target);
                        }}
                        onPointerCancel={() => setDrag(null)} onLostPointerCapture={() => setDrag(null)}>
                        <GripVertical size={19} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onOpen(row.key)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 text-left text-sm text-slate-700 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                        <span className="min-w-6 shrink-0 font-semibold tabular-nums text-blue-800">{row.number}.</span>
                        <span className="truncate">{row.text.trim() || 'Soal baru'}</span>
                    </button>
                    <button type="button" className={handleClass} disabled={index === 0} aria-label={'Naikkan soal ' + row.number}
                        onClick={() => onMove(row.key, rows[index - 1].key)}><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" className={handleClass} disabled={index === rows.length - 1} aria-label={'Turunkan soal ' + row.number}
                        onClick={() => onMove(row.key, rows[index + 1].key)}><ArrowDown size={16} aria-hidden="true" /></button>
                </li>
            ))}
        </ol>
    </section>;
}

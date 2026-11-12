import { useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import QuestionContent from '../pages/guru/QuestionContent';

type Point = { x: number; y: number };
type Drag = { row: number; pointerId: number; start: Point; moved: boolean };

const colors = ['#2563eb', '#7c3aed', '#0f766e', '#be185d', '#a34a09', '#0369a1'];
const colorFor = (row: number) => colors[row % colors.length];
const letter = (index: number) => String.fromCharCode(65 + index);
const card = 'relative flex min-h-12 min-w-0 select-none items-center gap-1.5 rounded-xl border p-2 text-left text-xs leading-relaxed transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-default sm:gap-2.5 sm:p-3 sm:text-sm';

export default function MatchingBoard({ left, right, value, disabled, description, onConnect }: {
    left: string[];
    right: string[];
    value: readonly (number | null)[];
    disabled?: boolean;
    description: string;
    onConnect: (row: number, option: number) => void;
}) {
    const instructionsId = useId();
    const board = useRef<HTMLDivElement>(null);
    const drag = useRef<Drag | null>(null);
    const suppressClick = useRef(false);
    const [active, setActive] = useState<number | null>(null);
    const [preview, setPreview] = useState<{ point: Point; target: number | null } | null>(null);
    const [anchors, setAnchors] = useState<{ left: Point[]; right: Point[] }>({ left: [], right: [] });

    useLayoutEffect(() => {
        const element = board.current;
        if (!element) return;
        const points = (side: string, bounds: DOMRect) => Array.from(element.querySelectorAll('[data-anchor="' + side + '"]'), node => {
            const rect = node.getBoundingClientRect();
            return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
        });
        const measure = () => {
            const bounds = element.getBoundingClientRect();
            setAnchors({ left: points('left', bounds), right: points('right', bounds) });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        element.querySelectorAll('[data-match-row]').forEach(row => observer.observe(row));
        return () => observer.disconnect();
    }, [left.length, right.length]);

    const selected = disabled ? null : active;
    const matched = value.filter(option => option !== null).length;

    function connect(row: number, option: number) {
        if (disabled) return;
        onConnect(row, option);
        setActive(null);
    }

    function targetAt(event: PointerEvent) {
        const button = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-match-target]');
        return button && board.current?.contains(button) && !button.matches(':disabled') ? Number(button.dataset.matchTarget) : null;
    }

    function beginDrag(event: PointerEvent<HTMLSpanElement>, row: number) {
        if (disabled || !event.isPrimary || event.button !== 0 || event.currentTarget.closest('button:disabled')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { row, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, moved: false };
    }

    function moveDrag(event: PointerEvent<HTMLSpanElement>) {
        const gesture = drag.current;
        const bounds = board.current?.getBoundingClientRect();
        if (disabled || !gesture || gesture.pointerId !== event.pointerId || !bounds) return;
        if (!gesture.moved && Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) < 6) return;
        gesture.moved = true;
        setActive(gesture.row);
        setPreview({
            point: {
                x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
                y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
            },
            target: targetAt(event)
        });
    }

    function finishDrag(event: PointerEvent<HTMLSpanElement>, cancelled = false) {
        const gesture = drag.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        drag.current = null;
        setPreview(null);
        if (!gesture.moved || cancelled) return;
        suppressClick.current = true;
        const option = targetAt(event);
        if (option !== null) connect(gesture.row, option);
    }

    function arrow(from: Point | undefined, to: Point | undefined, color: string, temporary = false) {
        if (!from || !to) return null;
        const end = Math.max(from.x, to.x - 5);
        const bend = (from.x + end) / 2;
        return <g stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={`M ${from.x} ${from.y} C ${bend} ${from.y}, ${bend} ${to.y}, ${end} ${to.y}`}
                strokeDasharray={temporary ? '5 5' : undefined} />
            {end - from.x > 9 && <path d={`M ${end - 6} ${to.y - 4} L ${end} ${to.y} L ${end - 6} ${to.y + 4}`} />}
        </g>;
    }

    return <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
            <p id={instructionsId} className="min-w-0 flex-1 basis-48 text-sm text-slate-600">{description}</p>
            <span role="status" className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold tabular-nums text-blue-900">
                {matched}/{left.length} terhubung
            </span>
        </div>
        <div className="grid grid-cols-2 gap-11 px-1 text-xs font-semibold text-slate-600 sm:gap-24">
            <span>Kolom kiri</span><span>Kolom kanan</span>
        </div>
        <div ref={board} aria-describedby={instructionsId} role="group" aria-label="Hubungkan pasangan" className="relative grid gap-2.5">
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 size-full">
                {value.map((option, row) => option !== null && <g key={row}>{arrow(anchors.left[row], anchors.right[option], colorFor(row))}</g>)}
                {selected !== null && preview && arrow(anchors.left[selected],
                    preview.target === null ? preview.point : anchors.right[preview.target], colorFor(selected), true)}
            </svg>
            {left.map((text, row) => {
                const source = value.indexOf(row);
                const option = value[row] ?? null;
                const leftActive = selected === row;
                const rightActive = selected !== null && (preview?.target === row || value[selected] === row);
                return <div key={row} data-match-row className="grid grid-cols-2 gap-11 sm:gap-24">
                    <button type="button" disabled={disabled} aria-pressed={leftActive}
                        aria-label={`${row + 1}. ${text}${option === null ? '' : ', terhubung ke ' + letter(option)}`}
                        className={card + (leftActive ? ' border-blue-500 bg-blue-100 ring-1 ring-blue-500' : option !== null ? ' border-blue-200 bg-blue-50' : ' border-slate-200 bg-white enabled:hover:border-blue-400')}
                        onPointerDown={() => { suppressClick.current = false; }}
                        onClick={event => {
                            if (suppressClick.current && event.detail) return;
                            setActive(leftActive ? null : row);
                        }}>
                        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-md bg-slate-100 font-semibold tabular-nums text-slate-700 sm:size-7">{row + 1}</span>
                        <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]"><QuestionContent text={text} /></span>
                        <span aria-hidden="true" className="absolute -right-4 top-1/2 z-20 grid size-8 -translate-y-1/2 touch-none cursor-grab place-items-center active:cursor-grabbing"
                            onPointerDown={event => beginDrag(event, row)} onPointerMove={moveDrag}
                            onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)}
                            onLostPointerCapture={event => finishDrag(event, true)}>
                            <span data-anchor="left" className="size-3.5 rounded-full border-2 border-white shadow-sm"
                                style={{ backgroundColor: leftActive || option !== null ? colorFor(row) : '#94a3b8' }} />
                        </span>
                    </button>
                    <button type="button" disabled={disabled} data-match-target={row}
                        aria-label={`${letter(row)}. ${right[row]}${source < 0 ? '' : ', terhubung dari ' + (source + 1)}`}
                        className={card + (rightActive ? ' border-blue-500 bg-blue-100 ring-1 ring-blue-500' : source >= 0 ? ' border-blue-200 bg-blue-50' : ' border-slate-200 bg-white enabled:hover:border-blue-400')}
                        onClick={() => { if (selected !== null) connect(selected, row); }}>
                        <span data-anchor="right" aria-hidden="true" className="absolute -left-1.5 top-1/2 z-20 size-3.5 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
                            style={{ backgroundColor: source >= 0 ? colorFor(source) : '#94a3b8' }} />
                        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-md bg-slate-100 font-semibold text-slate-700 sm:size-7">{letter(row)}</span>
                        <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]"><QuestionContent text={right[row]} /></span>
                    </button>
                </div>;
            })}
        </div>
    </div>;
}

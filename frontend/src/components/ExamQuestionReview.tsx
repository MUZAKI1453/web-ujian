import { useEffect, useRef, type ReactNode } from 'react';
import { Check, CheckCheck, CircleDot, ClipboardList, FilePenLine, ListChecks, TextCursorInput, X } from 'lucide-react';
import QuestionContent from '../pages/guru/QuestionContent';
import { questionTypeLabels } from '../pages/guru/questionTypes';

type ReviewQuestion = {
    id: number;
    nomor?: number;
    tipeSoal: string;
    pertanyaan: string;
    dibatalkan?: boolean;
    semuaBenar?: boolean;
    isi: { gambar?: string; items?: { teks: string; gambar?: string; benar: boolean }[]; jawaban?: string[] } | null;
};

const groupIcons = { PG: CircleDot, PM: ListChecks, BS: CheckCheck, ISIAN: TextCursorInput, ESSAY: FilePenLine };
const groups = [...Object.entries(questionTypeLabels), ['lainnya', 'Soal Lainnya']];

export function optionLabel(index: number): string {
    const letter = String.fromCharCode(65 + index % 26);
    return index < 26 ? letter : optionLabel(Math.floor(index / 26) - 1) + letter;
}

export function ExamReviewHeader({ label, title, metadata, actions }: {
    label: string; title: string; metadata: ReactNode; actions: ReactNode;
}) {
    const header = useRef<HTMLElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        header.current?.scrollIntoView({ block: 'start' });
        heading.current?.focus({ preventScroll: true });
    }, []);

    return <header ref={header} className="ui-card flex scroll-mt-20 flex-col gap-3 bg-white p-4 sm:p-5 xl:flex-row xl:flex-wrap xl:items-center">
        <div className="min-w-0 xl:flex-[1_1_20rem]">
            <p className="text-sm font-semibold text-blue-700">{label}</p>
            <h1 ref={heading} tabIndex={-1} className="ui-page-title mt-1 [overflow-wrap:anywhere]">{title}</h1>
            <div className="mt-3">{metadata}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 [&>button]:grow xl:ml-auto xl:[&>button]:grow-0">
            {actions}
        </div>
    </header>;
}

export default function ExamQuestionReview<T extends ReviewQuestion>({ questions, points, details }: {
    questions: readonly T[];
    points: (question: T) => string | undefined;
    details?: (question: T) => ReactNode;
}) {
    const byType = new Map<string, { question: T; number: number }[]>();
    questions.forEach((question, index) => {
        const type = question.tipeSoal.toUpperCase();
        const key = Object.prototype.hasOwnProperty.call(groupIcons, type) ? type : 'lainnya';
        const group = byType.get(key) ?? [];
        group.push({ question, number: question.nomor ?? index + 1 });
        byType.set(key, group);
    });

    return <div className="space-y-4 sm:space-y-5">
        {groups.map(([type, label]) => {
            const group = byType.get(type);
            if (!group) return null;
            const Icon = groupIcons[type as keyof typeof groupIcons] ?? ClipboardList;
            const statements = type === 'BS';
            return <section key={type} className="ui-card min-w-0 overflow-hidden bg-white">
                <h2 className="flex items-center gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 font-semibold text-blue-900">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white"><Icon size={20} aria-hidden="true" /></span>
                    {label}
                </h2>
                <div className="divide-y divide-slate-200">{group.map(({ question, number }) => {
                    const score = points(question);
                    return <article key={question.id} className="min-w-0 space-y-3 p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs">
                                    <ClipboardList size={14} aria-hidden="true" />Nomor {String(number).padStart(2, '0')}
                                </span>
                                {question.dibatalkan && <span className="text-xs text-red-700">Dibatalkan</span>}
                            </h3>
                            {score && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-800">{score}</span>}
                        </div>
                        <div className={'min-w-0 whitespace-pre-wrap text-base leading-relaxed [overflow-wrap:anywhere]' +
                            (type === 'ESSAY' ? ' max-w-3xl rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:p-4' : '')}>
                            <QuestionContent text={question.pertanyaan} image={question.isi?.gambar} />
                        </div>
                        {!!question.isi?.items?.length && <ol className="space-y-1.5">
                            {question.isi.items.map((item, index) => <li key={index} className={'flex min-w-0 items-start gap-2 rounded-lg px-2.5 py-2 text-sm sm:px-3 ' +
                                (item.benar ? 'bg-green-50 text-green-900' : statements ? 'bg-red-50 text-red-900' : 'bg-slate-50')}>
                                {statements ? <span className="grid min-h-6 min-w-6 shrink-0 place-items-center rounded-md bg-white px-1 font-semibold">
                                    {index + 1}
                                </span> : <input type="checkbox" checked={item.benar} disabled
                                    aria-label={`Kunci opsi ${optionLabel(index)}`} className="mt-0.5 size-4 shrink-0 accent-emerald-700" />}
                                <div className="min-w-0 flex-1 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
                                    {!statements && <span className="mr-1.5 font-semibold">{optionLabel(index)}.</span>}
                                    <QuestionContent text={item.teks} image={item.gambar} />
                                </div>
                                {statements ? <span className="flex shrink-0 items-center gap-1 text-xs font-semibold">
                                    {item.benar ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
                                    {item.benar ? 'Benar' : 'Salah'}
                                </span> : null}
                            </li>)}
                        </ol>}
                        {!!question.isi?.jawaban?.length && type === 'ISIAN' && <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">
                            <p className="font-semibold">Kunci jawaban</p>
                            <ul className="mt-2 flex flex-wrap gap-2">
                                {question.isi.jawaban.map((answer, index) => <li key={index} className="max-w-full whitespace-pre-wrap rounded-lg border border-blue-200 bg-white px-3 py-1.5 [overflow-wrap:anywhere]">{answer}</li>)}
                            </ul>
                        </div>}
                        {question.semuaBenar && <p className="text-sm font-medium text-green-800">Semua jawaban diterima.</p>}
                        {details?.(question)}
                    </article>;
                })}</div>
            </section>;
        })}
    </div>;
}

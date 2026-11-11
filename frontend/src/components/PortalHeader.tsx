import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

export function PortalHeader({ title, label, subtitle, icon: Icon, children }: {
    title: string; label: string; subtitle: string; icon: LucideIcon; children?: ReactNode;
}) {
    const now = new Date();
    const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => date.find(item => item.type === type)?.value ?? '';
    const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return <header className="ui-card relative isolate flex flex-col overflow-hidden bg-white md:flex-row">
        <div className="absolute bottom-0 left-0 top-0 w-1 bg-blue-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
                <Icon size={17} className="shrink-0" aria-hidden="true" />{label}
            </p>
            <h1 className="mt-4 break-words text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
            {children && <div className="mt-6 flex flex-wrap items-center gap-2">{children}</div>}
        </div>
        <div className="relative flex items-center justify-between gap-4 overflow-hidden border-t border-blue-100 bg-blue-50/70 px-6 py-4 sm:px-8 md:w-52 md:shrink-0 md:flex-col md:items-start md:justify-center md:gap-3 md:border-l md:border-t-0 md:py-6">
            <span className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-blue-100/70" aria-hidden="true" />
            <time dateTime={isoDate} aria-label={date.map(item => item.value).join('')} className="relative flex items-center gap-3 text-blue-950 md:block">
                <span className="text-3xl font-bold leading-none tracking-tight sm:text-4xl md:text-6xl">{part('day')}</span>
                <span className="block text-xs leading-5 md:mt-3 md:text-sm"><span className="block font-semibold">{part('weekday')}</span>{part('month')} {part('year')}</span>
            </time>
        </div>
    </header>;
}

export function PortalStat({ value, label, icon: Icon, green = false }: {
    value: React.ReactNode; label: string; icon: LucideIcon; green?: boolean;
}) {
    return <div className="cbt-stat">
        <span className={'cbt-stat-icon ' + (green ? 'cbt-stat-green' : '')}><Icon size={28} aria-hidden="true" /></span>
        <div><strong>{value}</strong><p>{label}</p></div>
    </div>;
}

export function ExamListHeader({ description, children }: { description: string; children?: ReactNode }) {
    return <header className="ui-card flex flex-col gap-4 border-blue-100 bg-gradient-to-br from-white to-blue-50/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700 sm:size-14">
                <ClipboardList size={24} aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <h1 className="ui-page-title">Ujian Saya</h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
        </div>
        {children}
    </header>;
}

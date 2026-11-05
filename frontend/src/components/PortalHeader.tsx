import type { LucideIcon } from 'lucide-react';

export function PortalHeader({ name, subtitle, icon: Icon, children }: {
    name: string; subtitle: string; icon: LucideIcon; children?: React.ReactNode;
}) {
    return <header className="cbt-hero">
        <div className="relative z-10 min-w-0 flex-1">
            <h1>Halo, {name} <span aria-hidden="true">👋</span></h1>
            <p>{subtitle}</p>
            {children && <div className="mt-4">{children}</div>}
        </div>
        <Icon className="cbt-hero-icon" size={88} strokeWidth={1.3} aria-hidden="true" />
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

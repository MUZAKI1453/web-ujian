import type { Prisma } from '@prisma/client';
import { object } from './examGrading';

export const MAX_VIOLATIONS = 3;
export const securityReasons = ['tab-hidden', 'window-blur', 'fullscreen-exit', 'split-screen'] as const;
export type SecurityEvent = { id: string; reason: typeof securityReasons[number] };

export function parseSecurityEvents(input: unknown): SecurityEvent[] | null {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > MAX_VIOLATIONS) return null;
    const events: SecurityEvent[] = [];
    for (const raw of input) {
        const event = object(raw);
        if (typeof event.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(event.id) ||
            !securityReasons.includes(event.reason as SecurityEvent['reason'])) return null;
        if (!events.some(item => item.id === event.id)) events.push({ id: event.id, reason: event.reason as SecurityEvent['reason'] });
    }
    return events;
}

// The caller holds the exam/attempt transaction lock; retries must not count twice.
export async function recordSecurity(tx: Prisma.TransactionClient, ujianId: number, siswaId: number, attemptId: number, events: SecurityEvent[]) {
    const rows = await tx.kegiatanUjian.findMany({ where: {
        ujianId, pelakuId: siswaId, jenis: 'pelanggaran-ujian', data: { path: ['attemptId'], equals: attemptId }
    }, select: { data: true } });
    const known = new Set(rows.map(row => object(row.data).eventId));
    let count = rows.length;
    for (const event of events) {
        if (known.has(event.id) || count >= MAX_VIOLATIONS) continue;
        await tx.kegiatanUjian.create({ data: {
            ujianId, pelakuId: siswaId, jenis: 'pelanggaran-ujian',
            alasan: event.reason, data: { attemptId, eventId: event.id, reason: event.reason }
        } });
        known.add(event.id);
        count++;
    }
    return { securityCount: count, securityAck: events.map(event => event.id) };
}

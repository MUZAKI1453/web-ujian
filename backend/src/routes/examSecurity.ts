import type { Prisma } from '@prisma/client';
import { object } from './examGrading';

// Batas pelanggaran per ujian: 0 = hanya dicatat (tidak pernah dikumpulkan otomatis), 1–10 = kumpul otomatis pada pelanggaran ke-n.
export const DEFAULT_VIOLATION_LIMIT = 3;
// Tanpa kumpul otomatis, catatan gangguan per pengerjaan tetap dibatasi agar log tidak membengkak.
const UNLIMITED_LOG_CAP = 50;
export const SECURITY_BATCH = 16;
const interruptionReasons = ['tab-hidden', 'window-blur', 'fullscreen-exit', 'split-screen'];
export const defaultSecurityWeights = { 'tab-hidden': 2, 'window-blur': 2, 'fullscreen-exit': 2, 'split-screen': 2,
    copy: 1, paste: 1, 'context-menu': 1, print: 1 };
export type SecurityWeights = typeof defaultSecurityWeights;
export type SecurityEvent = { id: string; reason: keyof SecurityWeights };

export function parseSecurityWeights(value: unknown): SecurityWeights | null {
    const entries = Object.entries(object(value));
    if (entries.length !== Object.keys(defaultSecurityWeights).length || entries.some(([key, weight]) =>
        !Object.prototype.hasOwnProperty.call(defaultSecurityWeights, key) || typeof weight !== 'number' ||
        !Number.isInteger(weight) || weight < 0 || weight > 10)) return null;
    return Object.fromEntries(entries) as SecurityWeights;
}

export function parseSecurityLimit(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
}

export type SecurityConfig = { weights: SecurityWeights; limit: number };
export const defaultSecurityConfig: SecurityConfig = { weights: defaultSecurityWeights, limit: DEFAULT_VIOLATION_LIMIT };

// Batas disimpan sebagai "batas" bersama bobot dalam satu baris pengaturan. Baris lama tanpa batas memakai bawaan.
export function parseSecurityConfig(value: unknown): SecurityConfig | null {
    const { batas, ...rest } = object(value);
    const weights = parseSecurityWeights(rest);
    const limit = batas === undefined ? DEFAULT_VIOLATION_LIMIT : parseSecurityLimit(batas);
    return weights && limit !== null ? { weights, limit } : null;
}

export function interruptsExam(reason: SecurityEvent['reason']) {
    return interruptionReasons.includes(reason);
}

export function parseSecurityEvents(input: unknown): SecurityEvent[] | null {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > SECURITY_BATCH) return null;
    const events: SecurityEvent[] = [];
    for (const raw of input) {
        const event = object(raw);
        if (typeof event.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(event.id) ||
            typeof event.reason !== 'string' || !Object.prototype.hasOwnProperty.call(defaultSecurityWeights, event.reason)) return null;
        if (!events.some(item => item.id === event.id)) events.push({ id: event.id, reason: event.reason as SecurityEvent['reason'] });
    }
    return events;
}

// The caller holds the exam/attempt transaction lock; retries must not count twice.
export async function recordSecurity(tx: Prisma.TransactionClient, ujianId: number, siswaId: number, attemptId: number, events: SecurityEvent[],
    weights = defaultSecurityWeights, limit = DEFAULT_VIOLATION_LIMIT) {
    const cap = limit || UNLIMITED_LOG_CAP;
    const reasons = [...new Set([...interruptionReasons, ...events.map(event => event.reason)])];
    const allRows = await tx.kegiatanUjian.findMany({ where: {
        ujianId, pelakuId: siswaId, jenis: 'pelanggaran-ujian', alasan: { in: reasons }
    }, select: { data: true, alasan: true, waktu: true } });
    const rows = allRows.filter(row => {
        const rowAttemptId = object(row.data).attemptId;
        return rowAttemptId === undefined || rowAttemptId === attemptId;
    });
    const known = new Set(rows.map(row => object(row.data).eventId));
    let count = rows.filter(row => row.alasan && interruptsExam(row.alasan as SecurityEvent['reason'])).length;
    const recent = new Set(rows.filter(row => Date.now() - +row.waktu < 10_000).map(row => row.alasan));
    for (const event of events) {
        const interrupt = interruptsExam(event.reason);
        const weight = weights[event.reason];
        if (!weight || known.has(event.id) || (interrupt ? count >= cap : recent.has(event.reason))) continue;
        await tx.kegiatanUjian.create({ data: {
            ujianId, pelakuId: siswaId, jenis: 'pelanggaran-ujian',
            alasan: event.reason, data: { attemptId, eventId: event.id, reason: event.reason, weight }
        } });
        known.add(event.id);
        recent.add(event.reason);
        if (interrupt) count++;
    }
    return { securityCount: count, securityAck: events.map(event => event.id) };
}

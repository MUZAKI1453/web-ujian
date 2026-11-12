import type { Question, Value } from './attemptStore';

export function answerState(q: Pick<Question, 'tipeSoal' | 'items'>, value: Value | undefined) {
    if (value === undefined || (typeof value === 'string' && !value.trim()) ||
        (Array.isArray(value) && (!value.length || value.every(v => v === null)))) return 'Kosong';
    if (q.tipeSoal === 'BS' && Array.isArray(value) &&
        (value.length !== q.items.length || value.some(v => typeof v !== 'boolean'))) return 'Belum lengkap';
    if (q.tipeSoal === 'JODOH' && Array.isArray(value) &&
        (value.length !== q.items.length || value.some(v => typeof v !== 'number'))) return 'Belum lengkap';
    return 'Terjawab';
}

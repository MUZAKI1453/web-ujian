import { object } from './examGrading';

export function answerSummary(questions: { id: number; tipeSoal: string; isi: unknown }[], raw: unknown) {
    const answers = object(raw);
    let answered = 0;
    let partial = 0;
    for (const q of questions) {
        const value = answers[q.id];
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim()) ||
            (Array.isArray(value) && (!value.length || value.every(v => v === null)))) continue;
        const items = object(q.isi).items;
        if (q.tipeSoal === 'BS' && Array.isArray(value) &&
            (!Array.isArray(items) || value.length !== items.length || value.some(v => typeof v !== 'boolean'))) partial++;
        else answered++;
    }
    return { total: questions.length, answered, partial, missing: questions.length - answered - partial };
}


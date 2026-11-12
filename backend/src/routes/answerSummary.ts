import { object } from './examGrading';
import { isMatchingAnswer } from './matching';

export function isBlankAnswer(value: unknown) {
    return value === undefined || value === null || (typeof value === 'string' && !value.trim()) ||
        (Array.isArray(value) && (!value.length || value.every(v => v === null)));
}

export function answerSummary(questions: { id: number; tipeSoal: string; isi: unknown }[], raw: unknown) {
    const answers = object(raw);
    let answered = 0;
    let partial = 0;
    for (const q of questions) {
        const value = answers[q.id];
        if (isBlankAnswer(value)) continue;
        const { items, pasangan } = object(q.isi);
        if (q.tipeSoal === 'BS' && Array.isArray(value) &&
            (!Array.isArray(items) || value.length !== items.length || value.some(v => typeof v !== 'boolean'))) partial++;
        else if (q.tipeSoal === 'JODOH' && !isMatchingAnswer(value, Array.isArray(pasangan) ? pasangan.length : 0)) partial++;
        else answered++;
    }
    return { total: questions.length, answered, partial, missing: questions.length - answered - partial };
}


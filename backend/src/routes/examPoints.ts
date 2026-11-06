import { Prisma } from '@prisma/client';

const types = ['PM', 'BS', 'ISIAN'] as const;
type SpecialType = typeof types[number];

export function calculatePoints(
    questions: { id: number; tipeSoal: string; bobot: Prisma.Decimal }[],
    input: unknown
) {
    if (!questions.length) throw new Error('Tambahkan minimal satu soal.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pengaturan poin tidak valid.');
    const special: Partial<Record<SpecialType, number>> = {};
    for (const [key, value] of Object.entries(input)) {
        if (!types.includes(key as SpecialType) || typeof value !== 'number' || !Number.isFinite(value) ||
            value <= 0 || value > 100 || new Prisma.Decimal(value).decimalPlaces() > 4) {
            throw new Error('Poin khusus harus lebih dari 0, maksimal 100, dan maksimal empat desimal.');
        }
        special[key as SpecialType] = value;
    }
    const units = (value: number | Prisma.Decimal) => new Prisma.Decimal(value).mul(10000).toNumber();
    const rows = questions.map(question => {
        const value = special[question.tipeSoal as SpecialType];
        const source = question.tipeSoal === 'ESSAY' ? 'Essay' : value !== undefined ? 'Khusus' : 'Bagi rata';
        const points = source === 'Essay' ? units(question.bobot) : value === undefined ? 0 : units(value);
        return { id: question.id, tipeSoal: question.tipeSoal, source, units: points };
    });
    if (questions.every(question => question.tipeSoal === 'ESSAY')) {
        if (rows.some(row => !Number.isSafeInteger(row.units) || row.units <= 0)) throw new Error('Poin maksimum esai harus lebih dari 0.');
        const total = rows.reduce((sum, row) => sum + row.units, 0);
        const shares = rows.map((row, index) => {
            const exact = row.units * 1000000 / total;
            const allocated = Math.floor(exact);
            return { row, index, allocated, remainder: exact - allocated };
        });
        const remaining = 1000000 - shares.reduce((sum, share) => sum + share.allocated, 0);
        shares.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
        shares.forEach((share, index) => { share.row.units = share.allocated + (index < remaining ? 1 : 0); });
    } else {
        const distributed = rows.filter(row => row.source === 'Bagi rata');
        const remaining = 1000000 - rows.reduce((sum, row) => sum + row.units, 0);
        if (distributed.length ? remaining < distributed.length : remaining !== 0) {
            throw new Error(distributed.length ? 'Sisakan poin positif untuk setiap soal bagi rata.' : 'Total poin terkunci harus tepat 100.');
        }
        distributed.forEach((row, index) => {
            row.units = Math.floor(remaining / distributed.length) + (index < remaining % distributed.length ? 1 : 0);
        });
    }
    return { special, rows: rows.map(row => ({ id: row.id, tipeSoal: row.tipeSoal, source: row.source, poin: (row.units / 10000).toFixed(4) })) };
}

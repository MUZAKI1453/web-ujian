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
    const distributed = rows.filter(row => row.source === 'Bagi rata');
    const remaining = 1000000 - rows.reduce((sum, row) => sum + row.units, 0);
    if (distributed.length ? remaining < distributed.length : remaining !== 0) {
        throw new Error(distributed.length ? 'Sisakan poin positif untuk setiap soal bagi rata.' : 'Total poin terkunci harus tepat 100.');
    }
    distributed.forEach((row, index) => {
        row.units = Math.floor(remaining / distributed.length) + (index < remaining % distributed.length ? 1 : 0);
    });
    return { special, rows: rows.map(row => ({ id: row.id, tipeSoal: row.tipeSoal, source: row.source, poin: (row.units / 10000).toFixed(4) })) };
}

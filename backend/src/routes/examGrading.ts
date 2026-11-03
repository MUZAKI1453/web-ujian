import { Prisma } from '@prisma/client';

export const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

type Question = {
    id: number; tipeSoal: string; isi: Prisma.JsonValue; bobot: Prisma.Decimal;
    dibatalkan: boolean; semuaBenar: boolean;
};

const units = (value: Prisma.Decimal | number) => Number(new Prisma.Decimal(value).mul(10000));
const fixed = (value: number) => (value / 10000).toFixed(4);
const normalized = (value: string, numeric: boolean) => {
    const text = value.trim().replace(/\s+/g, ' ').toLowerCase();
    return numeric && /^[+-]?\d+(?:[.,]\d+)?$/.test(text) ? new Prisma.Decimal(text.replace(',', '.')).toString() : text;
};

export function essayLimit(question: Question) {
    return Number(object(question.isi).poinEssay ?? question.bobot);
}

export function grade(questions: Question[], raw: unknown, essay: unknown) {
    const answers = object(raw);
    const manual = object(essay);
    const types: Record<string, { benar: number; total: number; poin: number; maksimum: number }> = {};
    let auto = 0;
    let written = 0;
    let pending = 0;
    for (const question of questions) {
        if (question.dibatalkan) continue;
        const key = String(question.id);
        const value = answers[key];
        const isi = object(question.isi);
        const max = units(question.bobot);
        const stats = types[question.tipeSoal] ??= { benar: 0, total: 0, poin: 0, maksimum: 0 };
        stats.total++;
        stats.maksimum += max;
        let score = 0;
        if (question.tipeSoal === 'ESSAY') {
            const mark = manual[key];
            if (typeof mark !== 'number') pending++;
            else score = Math.round(mark * max / essayLimit(question));
            written += score;
        } else {
            const items = Array.isArray(isi.items) ? isi.items : [];
            const keys = items.flatMap((item, index) => object(item).benar === true ? [index] : []);
            let correct = question.semuaBenar;
            if (!correct) {
                if (question.tipeSoal === 'PG') correct = keys.length === 1 && value === keys[0];
                if (question.tipeSoal === 'PM' && Array.isArray(value)) {
                    const selected = new Set(value);
                    correct = selected.size === keys.length && keys.length > 0 && keys.every(i => selected.has(i));
                }
                if (question.tipeSoal === 'BS' && Array.isArray(value)) {
                    correct = items.length > 0 && items.length === value.length && items.every((item, i) => value[i] === object(item).benar);
                }
                if (question.tipeSoal === 'ISIAN' && typeof value === 'string' && value.trim() && Array.isArray(isi.jawaban)) {
                    correct = isi.jawaban.some(answer => typeof answer === 'string' && normalized(answer, isi.angka === true) === normalized(value, isi.angka === true));
                }
            }
            if (correct) score = max;
            auto += score;
        }
        if (score === max) stats.benar++;
        stats.poin += score;
    }
    const rincian = Object.fromEntries(Object.entries(types).map(([key, value]) => [key, {
        benar: value.benar, total: value.total, poin: fixed(value.poin), maksimum: fixed(value.maksimum)
    }]));
    return {
        pending, rincian,
        values: { nilaiPg: fixed(auto), nilaiEssay: fixed(written), totalNilai: ((auto + written) / 10000).toFixed(2), rincianNilai: rincian }
    };
}

export function revise(questions: Question[], id: number, action: unknown, input: unknown, special: unknown) {
    const rows = questions.map(question => ({ ...question }));
    const question = rows.find(item => item.id === id && !item.dibatalkan);
    if (!question || !['PG', 'PM', 'BS', 'ISIAN'].includes(question.tipeSoal)) throw new Error('Pilih soal otomatis yang masih aktif.');
    const isi = object(question.isi);
    if (action === 'terima-semua') question.semuaBenar = true;
    else if (action === 'tambah-jawaban' || (action === 'ubah-kunci' && question.tipeSoal === 'ISIAN')) {
        if (question.tipeSoal !== 'ISIAN' || typeof input !== 'string' || !input.trim()) throw new Error('Isi jawaban yang diterima.');
        const values = input.split('\n').map(text => text.trim()).filter(Boolean);
        const old = action === 'tambah-jawaban' && Array.isArray(isi.jawaban) ? isi.jawaban.filter(value => typeof value === 'string') : [];
        question.isi = { ...isi, jawaban: [...new Set([...old, ...values])] } as Prisma.JsonObject;
        question.semuaBenar = false;
    } else if (action === 'ubah-kunci') {
        const items = Array.isArray(isi.items) ? isi.items : [];
        if (!Array.isArray(input) || input.length !== items.length || !input.every(value => typeof value === 'boolean')) throw new Error('Isi kunci untuk setiap opsi atau pernyataan.');
        const count = input.filter(Boolean).length;
        if ((question.tipeSoal === 'PG' && count !== 1) || (question.tipeSoal === 'PM' && count < 2)) throw new Error('PG membutuhkan satu kunci. PM membutuhkan minimal dua kunci.');
        question.isi = { ...isi, items: items.map((item, index) => ({ ...object(item), benar: input[index] })) } as Prisma.JsonObject;
        question.semuaBenar = false;
    } else if (action === 'batalkan') {
        const remaining = rows.filter(item => !item.dibatalkan && item.id !== id);
        if (!remaining.length) throw new Error('Soal terakhir tidak bisa dibatalkan.');
        const evenly = remaining.filter(item => item.tipeSoal !== 'ESSAY' && object(special)[item.tipeSoal] === undefined);
        const targets = evenly.length ? evenly : remaining;
        const cancelled = units(question.bobot);
        const weight = (item: Question) => evenly.length ? 1 : units(item.bobot);
        const total = targets.reduce((sum, item) => sum + weight(item), 0);
        const allocations = targets.map(item => {
            const exact = cancelled * weight(item) / total;
            return { item, amount: Math.floor(exact), remainder: exact % 1 };
        }).sort((a, b) => b.remainder - a.remainder || a.item.id - b.item.id);
        const left = cancelled - allocations.reduce((sum, item) => sum + item.amount, 0);
        allocations.forEach(({ item, amount }, index) => {
            if (item.tipeSoal === 'ESSAY') item.isi = { ...object(item.isi), poinEssay: essayLimit(item) } as Prisma.JsonObject;
            item.bobot = new Prisma.Decimal(fixed(units(item.bobot) + amount + (index < left ? 1 : 0)));
        });
        question.dibatalkan = true;
        question.bobot = new Prisma.Decimal(0);
    } else throw new Error('Tindakan perbaikan tidak valid.');
    return rows;
}

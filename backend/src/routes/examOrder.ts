import { randomInt } from 'node:crypto';
import { object } from './examGrading';

// Urutan tampil untuk satu pengerjaan. `soal` berisi id soal sesuai urutan tampil;
// `opsi[idSoal][posisiTampil]` adalah indeks opsi asli. Jawaban selalu disimpan dan dinilai
// dengan indeks asli; hanya yang dikirim ke dan diterima dari perangkat siswa yang diterjemahkan.
export type ExamOrder = { soal: number[]; opsi: Record<string, number[]> };

type OrderQuestion = { id: number; tipeSoal: string; isi: unknown };

function shuffled<T>(values: T[], random: (max: number) => number) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function permutation(value: unknown, length?: number): value is number[] {
    return Array.isArray(value) && (length === undefined || value.length === length) &&
        value.every(n => Number.isInteger(n) && n >= 0 && n < value.length) && new Set(value).size === value.length;
}

export function makeExamOrder(questions: OrderQuestion[], acakSoal: boolean, acakOpsi: boolean,
    random: (max: number) => number = randomInt): ExamOrder | null {
    const soal = questions.map(question => question.id);
    if (acakSoal) {
        const slotsByType = new Map<string, number[]>();
        questions.forEach((question, index) => {
            const type = question.tipeSoal.toUpperCase();
            const slots = slotsByType.get(type) ?? [];
            slots.push(index);
            slotsByType.set(type, slots);
        });
        for (const slots of slotsByType.values()) {
            const ids = shuffled(slots.map(index => questions[index].id), random);
            slots.forEach((slot, index) => { soal[slot] = ids[index]; });
        }
    }
    const opsi: ExamOrder['opsi'] = {};
    for (const question of questions) {
        const type = question.tipeSoal.toUpperCase();
        const content = object(question.isi);
        const items = type === 'JODOH' ? content.pasangan : acakOpsi && ['PG', 'PM'].includes(type) ? content.items : null;
        if (!Array.isArray(items) || items.length < 2) continue;
        opsi[question.id] = shuffled(items.map((_, index) => index), random);
    }
    if (!acakSoal && !acakOpsi && !Object.keys(opsi).length) return null;
    return { soal, opsi };
}

export function parseExamOrder(value: unknown): ExamOrder | null {
    const data = object(value);
    if (!Array.isArray(data.soal) || !data.soal.every(id => Number.isSafeInteger(id))) return null;
    const opsi: ExamOrder['opsi'] = {};
    for (const [id, order] of Object.entries(object(data.opsi))) {
        if (permutation(order)) opsi[id] = order;
    }
    return { soal: data.soal as number[], opsi };
}

// Menyusun soal sesuai urutan pengerjaan. Soal yang tidak tercatat di urutan diletakkan di akhir.
export function orderQuestions<T extends { id: number }>(questions: T[], order: ExamOrder | null): T[] {
    if (!order) return questions;
    const position = new Map(order.soal.map((id, index) => [id, index]));
    return [...questions].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity) || a.id - b.id);
}

export function orderItems<T>(questionId: number, items: T[], order: ExamOrder | null): T[] {
    const map = order?.opsi[questionId];
    return map && map.length === items.length ? map.map(index => items[index]) : items;
}

function translate(answers: unknown, order: ExamOrder | null, convert: (map: number[], value: number) => number): unknown {
    if (!order || !answers || typeof answers !== 'object' || Array.isArray(answers)) return answers;
    const out: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(answers)) {
        const map = order.opsi[id];
        // Nilai di luar jangkauan dibiarkan apa adanya agar ditolak oleh validasi jawaban.
        const one = (entry: unknown) => map && typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < map.length
            ? convert(map, entry) : entry;
        out[id] = Array.isArray(value) && map ? value.map(one) : one(value);
    }
    return out;
}

// Jawaban dari perangkat siswa (posisi tampil) menjadi indeks opsi asli.
export function answersToOriginal(answers: unknown, order: ExamOrder | null) {
    return translate(answers, order, (map, value) => map[value]);
}

// Jawaban tersimpan (indeks asli) menjadi posisi tampil di perangkat siswa.
export function answersToDisplay(answers: unknown, order: ExamOrder | null) {
    return translate(answers, order, (map, value) => map.indexOf(value));
}

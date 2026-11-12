import type { Soal } from '@prisma/client';
import { isBlankAnswer } from './answerSummary';
import { essayLimit, grade, object } from './examGrading';

type QuestionStats = ReturnType<typeof questionStats>;
const objectiveTypes = ['PG', 'PM', 'BS', 'ISIAN', 'JODOH'];

function isObjective(row: Pick<QuestionStats, 'status' | 'tipe'>) {
    return row.status === 'aktif' && objectiveTypes.includes(row.tipe);
}

function correlation(n: number, selected: number, sum: number, squares: number, selectedSum: number) {
    const denominator = Math.sqrt(Math.max(0, n * selected - selected ** 2) * Math.max(0, n * squares - sum ** 2));
    return denominator ? (n * selectedSum - selected * sum) / denominator : null;
}

function questionStats(question: Soal, index: number) {
    const content = object(question.isi);
    const status = question.dibatalkan ? 'dibatalkan' : question.semuaBenar ? 'semua-benar' : 'aktif';
    const options = Array.isArray(content.items) ? content.items : [];
    return {
        id: question.id, nomor: index + 1, tipe: question.tipeSoal, pertanyaan: question.pertanyaan,
        adaGambar: Boolean(content.gambar) || options.some(item => Boolean(object(item).gambar)),
        status, benar: 0, salah: 0, kosong: 0, dikoreksi: 0, totalPoin: 0,
        restSum: 0, restSquares: 0, correctRestSum: 0,
        poinMaksimum: question.tipeSoal === 'ESSAY' ? essayLimit(question) : null,
        opsi: options.map(item => ({
            teks: String(object(item).teks ?? ''), benar: object(item).benar === true, dipilih: 0, selectedRestSum: 0
        }))
    };
}

export function collectQuestionStats(stats: QuestionStats[], raw: unknown, essay: unknown, result: ReturnType<typeof grade>) {
    const answers = object(raw);
    const marks = object(essay);
    const total = stats.reduce((sum, row) => sum + Number(isObjective(row) && result.penilaian[row.id]?.benar === true), 0);
    for (const row of stats) {
        if (row.status === 'dibatalkan') continue;
        const value = answers[row.id];
        const correct = result.penilaian[row.id]?.benar === true && !isBlankAnswer(value);
        const rest = total - Number(correct);
        if (isObjective(row)) {
            row.restSum += rest;
            row.restSquares += rest ** 2;
            if (correct) row.correctRestSum += rest;
        }
        if (isBlankAnswer(value)) row.kosong++;
        else if (row.tipe !== 'ESSAY') {
            if (correct) row.benar++;
            else row.salah++;
            if (row.tipe === 'PG' || row.tipe === 'PM') {
                const selected = Array.isArray(value) ? new Set(value) : new Set([value]);
                row.opsi.forEach((option, index) => {
                    if (!selected.has(index)) return;
                    option.dipilih++;
                    option.selectedRestSum += rest;
                });
            }
        }
        const mark = marks[row.id];
        if (row.tipe === 'ESSAY' && typeof mark === 'number') {
            row.dikoreksi++;
            row.totalPoin += mark;
        }
    }
    return total;
}

export const minimumItemSample = 10;

export function summarizeQuestionStats(stats: QuestionStats[], submissions: number, totalSquares: number) {
    const objective = stats.filter(isObjective);
    const total = objective.reduce((sum, row) => sum + row.benar, 0);
    const variance = submissions ? totalSquares / submissions - (total / submissions) ** 2 : 0;
    const k = objective.length;
    const kr20 = submissions >= minimumItemSample && k >= 2 && variance > 0
        ? k / (k - 1) * (1 - objective.reduce((sum, row) => {
            const p = row.benar / submissions;
            return sum + p * (1 - p);
        }, 0) / variance) : null;
    return {
        reliabilitas: { kr20, jumlahSoal: k, minimumSampel: minimumItemSample },
        analisisSoal: stats.map(({ totalPoin, restSum, restSquares, correctRestSum, opsi, ...row }) => {
            const eligible = isObjective(row) && submissions >= minimumItemSample && k >= 2;
            const dayaPembeda = eligible ? correlation(submissions, row.benar, restSum, restSquares, correctRestSum) : null;
            return {
                ...row, dayaPembeda, rataPoin: row.dikoreksi ? totalPoin / row.dikoreksi : null,
                opsi: opsi.map(({ selectedRestSum, ...option }) => ({ ...option,
                    korelasi: eligible && row.tipe === 'PG' && !option.benar
                        ? correlation(submissions, option.dipilih, restSum, restSquares, selectedRestSum) : null,
                    jarangDipilih: eligible && row.tipe === 'PG' && !option.benar && option.dipilih / submissions < 0.05
                }))
            };
        })
    };
}

export function createQuestionStats(questions: Soal[]) {
    return questions.map(questionStats);
}

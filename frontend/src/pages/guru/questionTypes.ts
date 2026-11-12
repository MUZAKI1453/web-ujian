export const questionTypeLabels: Record<string, string> = {
    PG: 'Pilihan Ganda', PM: 'Pilihan Majemuk', JODOH: 'Menjodohkan',
    BS: 'Benar atau Salah', ISIAN: 'Isian Singkat', ESSAY: 'Esai'
};

const order = Object.keys(questionTypeLabels);
export const questionTypeRank = (type: string) => {
    const index = order.indexOf(type.toUpperCase());
    return index < 0 ? order.length : index;
};

export function questionTypeLabel(type: string) {
    return questionTypeLabels[type] ?? type;
}

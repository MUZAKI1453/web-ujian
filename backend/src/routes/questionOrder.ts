const types = ['PG', 'PM', 'JODOH', 'BS', 'ISIAN', 'ESSAY'];
const rank = (type: string) => {
    const index = types.indexOf(type.toUpperCase());
    return index < 0 ? types.length : index;
};

export function sortQuestions<T extends { id: number; tipeSoal: string; urutan?: number | null }>(questions: readonly T[]) {
    return [...questions].sort((a, b) => rank(a.tipeSoal) - rank(b.tipeSoal) ||
        (a.urutan ?? Infinity) - (b.urutan ?? Infinity) || a.id - b.id);
}

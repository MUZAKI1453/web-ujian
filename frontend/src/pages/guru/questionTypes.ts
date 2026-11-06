export const questionTypeLabels: Record<string, string> = {
    PG: 'Pilihan Ganda', PM: 'Pilihan Majemuk', BS: 'Benar atau Salah',
    ISIAN: 'Isian Singkat', ESSAY: 'Esai'
};

export function questionTypeLabel(type: string) {
    return questionTypeLabels[type] ?? type;
}

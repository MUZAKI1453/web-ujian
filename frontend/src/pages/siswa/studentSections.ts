type ExamState = { status: string; submitted: boolean; offline: boolean; attempt: number | null };

export function isStudentHistory(exam: ExamState) {
    // Expired attempts stay actionable until the server acknowledges collection.
    return exam.submitted || exam.offline || (exam.status === 'Selesai' && !exam.attempt);
}

export function prioritizeStudentExams<T extends ExamState & { mulai: string }>(exams: T[]) {
    const rank = (exam: T) => exam.attempt ? 0 : exam.status === 'Berlangsung' ? 1 : 2;
    return [...exams].sort((a, b) => rank(a) - rank(b) || +new Date(a.mulai) - +new Date(b.mulai));
}

export function participantStatus(attempt: { waktuKirim: string | null; batasWaktu: string } | undefined, submitted: boolean, end: string, now: number) {
    if (attempt?.waktuKirim || submitted) return 'Sudah mengirim';
    if (!attempt) return 'Belum mulai';
    return Math.min(+new Date(attempt.batasWaktu), +new Date(end)) <= now ? 'Waktu habis' : 'Mengerjakan';
}

export function sessionExpanded(status: string, saved?: { status: string; open: boolean }) {
    return saved?.status === status ? saved.open : status === 'Berlangsung';
}

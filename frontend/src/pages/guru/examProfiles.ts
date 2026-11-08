export type ExamProfile = 'standar' | 'ulangan-harian' | 'latihan-kuis' | 'tryout' | 'latihan-osn'
    | 'tengah-semester' | 'akhir-semester' | 'ujian-sekolah';

export const gradeDestinationLabels: Record<string, string> = {
    'buku-nilai': 'Buku nilai', latihan: 'Rekap latihan', persiapan: 'Rekap persiapan', talenta: 'Rekap talenta'
};

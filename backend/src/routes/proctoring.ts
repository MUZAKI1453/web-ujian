import { object } from './examGrading';
import { interruptsExam, violationCancellation, type SecurityEvent } from './examSecurity';

// Logika murni panel pengawas. Rute di pengawasRoutes.ts hanya memuat data lalu memanggil fungsi di sini,
// sehingga aturan "apa yang boleh dilihat pengawas" bisa diuji tanpa database.

export type ProctorAssignment = { guruId: number; kelasIds: number[] };

const validId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

// Penugasan dari formulir guru: satu entri per guru, kelas harus bagian dari kelas ujian.
export function parseProctorAssignments(input: unknown, examClassIds: number[]): ProctorAssignment[] | null {
    if (!Array.isArray(input) || input.length > 100) return null;
    const allowed = new Set(examClassIds);
    const seen = new Set<number>();
    const result: ProctorAssignment[] = [];
    for (const raw of input) {
        const { guruId, kelasIds } = object(raw);
        if (!validId(guruId) || seen.has(guruId) || !Array.isArray(kelasIds) || !kelasIds.length ||
            new Set(kelasIds).size !== kelasIds.length || !kelasIds.every(id => validId(id) && allowed.has(id))) return null;
        seen.add(guruId);
        result.push({ guruId, kelasIds: kelasIds as number[] });
    }
    return result;
}

export function parseProctorNote(value: unknown) {
    const note = typeof value === 'string' ? value.trim() : '';
    return note.length >= 5 && note.length <= 500 ? note : null;
}

type Student = { id: number; nama: string | null; username: string; kelasId: number | null };
type Window = { token: string | null; masukBuka: boolean; waktuMulai: Date; waktuSelesai: Date };

export type ProctorExam = Window & {
    id: number; judul: string; profil: string; durasiMenit: number; mapel: { nama: string };
    siswa: Student[];
    jumlahSoal: number;
    susulan: (Window & { id: number; peserta: { siswaId: number }[] })[];
    pengerjaan: { id: number; siswaId: number; sesiSusulanId: number | null; mulai: Date; batasWaktu: Date; waktuKirim: Date | null; jawabanTersimpan: unknown }[];
    jawaban: { siswaId: number }[];
    pelanggaran: { id: number; pelakuId: number | null; alasan: string | null; data: unknown; waktu: Date }[];
    catatan: { id: number; data: unknown; waktu: Date; pelaku: { nama: string | null; username: string } | null }[];
};

// Hanya peserta dari kelas yang diawasi. Yang sengaja tidak pernah ikut: soal, kunci, isi jawaban, dan nilai.
export function proctorPanel(exam: ProctorExam, classes: { id: number; namaKelas: string }[], limit: number,
    lastContact: (attemptId: number) => number | undefined, now = Date.now()) {
    const className = new Map(classes.map(item => [item.id, item.namaKelas]));
    const students = exam.siswa.filter(student => student.kelasId !== null && className.has(student.kelasId));
    const ids = new Set(students.map(student => student.id));
    const attempts = new Map(exam.pengerjaan.map(attempt => [attempt.siswaId, attempt]));
    const submitted = new Set(exam.jawaban.map(answer => answer.siswaId));
    const makeup = new Map(exam.susulan.flatMap(session => session.peserta.map(entry => [entry.siswaId, session.id] as const)));
    return {
        id: exam.id, judul: exam.judul, mapel: exam.mapel.nama, profil: exam.profil, durasiMenit: exam.durasiMenit,
        jumlahSoal: exam.jumlahSoal, batasPelanggaran: limit, now, kelas: classes,
        sesi: [
            { key: 'reguler', jenis: 'Reguler', token: exam.token, masukBuka: exam.masukBuka, waktuMulai: exam.waktuMulai, waktuSelesai: exam.waktuSelesai },
            ...exam.susulan.map((session, index) => ({
                key: String(session.id), jenis: 'Susulan ' + (index + 1), token: session.token, masukBuka: session.masukBuka,
                waktuMulai: session.waktuMulai, waktuSelesai: session.waktuSelesai
            }))
        ],
        peserta: students.map(student => {
            const attempt = attempts.get(student.id);
            const sessionId = attempt ? attempt.sesiSusulanId : makeup.get(student.id) ?? null;
            const violations = exam.pelanggaran.filter(row => row.pelakuId === student.id &&
                (object(row.data).attemptId === undefined || object(row.data).attemptId === attempt?.id));
            return {
                id: student.id, nama: student.nama, username: student.username, kelas: className.get(student.kelasId!) ?? '',
                sesi: sessionId === null ? 'reguler' : String(sessionId),
                attemptId: attempt?.id ?? null, mulai: attempt?.mulai ?? null, batasWaktu: attempt?.batasWaktu ?? null,
                waktuKirim: attempt?.waktuKirim ?? null, terkirim: submitted.has(student.id) || Boolean(attempt?.waktuKirim),
                terisi: attempt ? Object.keys(object(attempt.jawabanTersimpan)).length : 0,
                kontakTerakhir: attempt ? lastContact(attempt.id) ?? null : null,
                jumlahPelanggaran: violations.filter(row => row.alasan && interruptsExam(row.alasan as SecurityEvent['reason']) &&
                    !violationCancellation(row.data)).length,
                pelanggaran: violations.map(row => ({ id: row.id, reason: row.alasan, waktu: row.waktu, dibatalkan: violationCancellation(row.data) }))
            };
        }),
        catatan: exam.catatan.map(row => ({
            id: row.id, teks: typeof object(row.data).teks === 'string' ? object(row.data).teks as string : '', waktu: row.waktu,
            oleh: row.pelaku ? row.pelaku.nama || row.pelaku.username : 'Akun dihapus'
        })),
        // Dipakai rute untuk memeriksa apakah sebuah catatan pelanggaran milik siswa yang diawasi.
        siswaIds: [...ids]
    };
}

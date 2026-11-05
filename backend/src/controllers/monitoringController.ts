import { Request, Response } from 'express';
import prisma from '../config/db';

const studentFields = { id: true, nama: true, username: true } as const;
type Student = { id: number; nama: string | null; username: string };
type Attempt = { siswaId: number; mulai: Date; batasWaktu: Date; waktuKirim: Date | null };

function summarizeSession(
    mulai: Date, selesai: Date, now: number, students: Student[],
    attempts: Attempt[], legacySubmissions: Map<number, Date>
) {
    const byStudent = new Map(attempts.map(attempt => [attempt.siswaId, attempt]));
    const peserta = students.map(student => {
        const attempt = byStudent.get(student.id);
        const waktuKirim = attempt?.waktuKirim ?? legacySubmissions.get(student.id) ?? null;
        const deadline = attempt ? Math.min(+attempt.batasWaktu, +selesai) : null;
        const status = waktuKirim ? 'Sudah mengirim' :
            deadline !== null && deadline <= now ? 'Waktu habis' :
            attempt && +attempt.mulai <= now && +mulai <= now ? 'Mengerjakan' : 'Belum mulai';
        return { ...student, status, batasWaktu: deadline === null ? null : new Date(deadline) };
    });
    return {
        mulai, selesai,
        status: now < +mulai ? 'Terjadwal' : now < +selesai ? 'Berlangsung' : 'Selesai',
        mengerjakan: peserta.filter(student => student.status === 'Mengerjakan').length,
        mengirim: peserta.filter(student => student.status === 'Sudah mengirim').length,
        belumMulai: peserta.filter(student => student.status === 'Belum mulai').length,
        waktuHabis: peserta.filter(student => student.status === 'Waktu habis').length,
        peserta
    };
}

export async function monitorUjian(_req: Request, res: Response) {
    try {
        const exams = await prisma.ujian.findMany({
            where: { draf: false },
            orderBy: { waktuMulai: 'desc' },
            select: {
                id: true, judul: true, waktuMulai: true, waktuSelesai: true,
                mapel: { select: { nama: true } },
                kelas: { select: {
                    namaKelas: true,
                    users: { where: { role: 'siswa' }, select: studentFields, orderBy: { nama: 'asc' } }
                } },
                kelasTujuan: { select: { id: true, namaKelas: true, users: { where: { role: 'siswa' }, select: studentFields, orderBy: { nama: 'asc' } } } },
                _count: { select: { soal: true } },
                jawaban: { select: { siswaId: true, waktuSubmit: true, siswa: { select: studentFields } } },
                pengerjaan: { select: {
                    siswaId: true, sesiSusulanId: true, mulai: true, batasWaktu: true, waktuKirim: true,
                    siswa: { select: studentFields }
                } },
                susulan: { orderBy: [{ waktuMulai: 'asc' }, { id: 'asc' }], select: {
                    id: true, waktuMulai: true, waktuSelesai: true,
                    peserta: { select: { siswa: { select: studentFields } }, orderBy: { siswa: { nama: 'asc' } } }
                } }
            }
        });
        const now = Date.now();
        res.json({ status: 'SUCCESS', data: exams.flatMap(exam => {
            const attempts = new Map(exam.pengerjaan.map(attempt => [attempt.siswaId, attempt]));
            const regular = new Map([...exam.kelas.users, ...exam.kelasTujuan.flatMap(k => k.users)].map(student => [student.id, student]));
            for (const session of exam.susulan) {
                for (const { siswa } of session.peserta) regular.delete(siswa.id);
            }
            const submissions = new Map(exam.jawaban.map(answer => [answer.siswaId, answer.waktuSubmit]));
            const regularAttempts = exam.pengerjaan.filter(attempt => attempt.sesiSusulanId === null);
            for (const attempt of regularAttempts) regular.set(attempt.siswaId, attempt.siswa);
            for (const answer of exam.jawaban) {
                if (attempts.get(answer.siswaId)?.sesiSusulanId == null) regular.set(answer.siswaId, answer.siswa);
            }

            const classNames = [...new Set([exam.kelas.namaKelas, ...exam.kelasTujuan.map(k => k.namaKelas)])].join(', ');
            const common = { ujianId: exam.id, judul: exam.judul, mapel: exam.mapel.nama, kelas: classNames, soal: exam._count.soal };
            return [
                {
                    ...common, id: 'reguler-' + exam.id, jenis: 'Reguler',
                    ...summarizeSession(exam.waktuMulai, exam.waktuSelesai, now, [...regular.values()], regularAttempts, submissions)
                },
                ...exam.susulan.map((session, index) => {
                    const sessionAttempts = exam.pengerjaan.filter(attempt => attempt.sesiSusulanId === session.id);
                    const students = new Map(session.peserta.map(({ siswa }) => [siswa.id, siswa]));
                    for (const attempt of sessionAttempts) students.set(attempt.siswaId, attempt.siswa);
                    const sessionSubmissions = new Map(sessionAttempts.flatMap(attempt => {
                        const submitted = submissions.get(attempt.siswaId);
                        return submitted ? [[attempt.siswaId, submitted] as const] : [];
                    }));
                    return {
                        ...common, id: 'susulan-' + session.id, jenis: 'Susulan', nomorSusulan: index + 1,
                        ...summarizeSession(session.waktuMulai, session.waktuSelesai, now, [...students.values()], sessionAttempts, sessionSubmissions)
                    };
                })
            ];
        }) });
    } catch (error) {
        console.error('Monitoring ujian gagal:', error);
        res.status(500).json({ status: 'ERROR', message: 'Gagal memuat monitoring ujian.' });
    }
}

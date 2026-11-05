import prisma from '../config/db';
import { answerSummary } from './answerSummary';

export async function studentReceipt(ujianId: number, siswaId: number) {
    const exam = await prisma.ujian.findFirst({
        where: { id: ujianId, draf: false }, include: {
            soal: { where: { dibatalkan: false } },
            pengerjaan: { where: { siswaId } },
            jawaban: { where: { siswaId }, orderBy: { waktuSubmit: 'desc' }, take: 1 }
        }
    });
    if (!exam) return null;
    const attempt = exam.pengerjaan[0];
    const answer = exam.jawaban[0];
    const review = !!attempt?.diterimaOffline;
    if (!review && !answer && !attempt?.waktuKirim) return null;
    return {
        id: `UJ-${ujianId}-${siswaId}-${attempt?.id ?? answer.id}`,
        title: exam.judul,
        receivedAt: review ? attempt!.diterimaOffline : attempt?.waktuKirim ?? answer.waktuSubmit,
        state: review ? 'review' : 'submitted',
        ...answerSummary(exam.soal, review ? attempt!.kirimanOffline : answer?.detailJawaban ?? attempt?.jawabanTersimpan)
    };
}

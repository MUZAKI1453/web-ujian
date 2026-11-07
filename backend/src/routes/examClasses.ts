import type { Prisma } from '@prisma/client';

// Include the original class so existing exams remain accessible without a backfill.
export function studentClassScope(kelasId: number): Prisma.UjianWhereInput {
    return { OR: [{ kelasId }, { kelasTujuan: { some: { id: kelasId } } }] };
}

export function remedialAccess(siswaId: number): Prisma.UjianWhereInput {
    return { OR: [{ ujianAsalId: null }, { pesertaRemedial: { some: { id: siswaId } } }] };
}

export function examClassIds(exam: { kelasId: number; kelasTujuan: { id: number }[] }) {
    return [...new Set([exam.kelasId, ...exam.kelasTujuan.map(item => item.id)])];
}

export function parseClassIds(input: unknown): number[] | null {
    if (!Array.isArray(input) || !input.length || input.length > 500 ||
        !input.every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id <= 2147483647) ||
        new Set(input).size !== input.length) return null;
    return input;
}

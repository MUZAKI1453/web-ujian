export type MatchingContent = {
    pasangan?: { kiri: string; kanan: string }[];
    kunci?: number[];
};

export function matchingPairs(content: MatchingContent | null | undefined, answer: unknown = content?.kunci) {
    const pairs = content?.pasangan ?? [];
    return pairs.map(({ kiri }, index) => {
        const selected = Array.isArray(answer) ? answer[index] : answer === undefined ? index : null;
        return { kiri, kanan: typeof selected === 'number' ? pairs[selected]?.kanan ?? '' : '' };
    });
}

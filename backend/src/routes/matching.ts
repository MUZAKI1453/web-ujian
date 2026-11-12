export function isMatchingAnswer(value: unknown, count: number, partial = false): value is (number | null)[] {
    if (!Array.isArray(value) || count < 2 || value.length !== count) return false;
    const selected = new Set<number>();
    for (const entry of value) {
        if (partial && entry === null) continue;
        if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry >= count || selected.has(entry)) return false;
        selected.add(entry);
    }
    return true;
}

export function matchingKey(content: Record<string, unknown>, count: number) {
    return isMatchingAnswer(content.kunci, count) ? content.kunci : Array.from({ length: count }, (_, index) => index);
}

const collator = new Intl.Collator('id-ID', { numeric: true, sensitivity: 'base' });

export function compareNames(a: string | null | undefined, b: string | null | undefined) {
    const first = a?.trim() ?? '';
    const second = b?.trim() ?? '';
    if (!first || !second) return first ? -1 : second ? 1 : 0;
    return collator.compare(first, second);
}

export function sortByName<T extends { id: number }>(items: T[], name: (item: T) => string | null | undefined): T[] {
    return [...items].sort((a, b) => compareNames(name(a), name(b)) || a.id - b.id);
}

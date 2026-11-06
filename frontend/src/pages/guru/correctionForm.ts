type Fields = Pick<FormData, 'get' | 'getAll'>;

export function correctionInput(type: string, itemCount: number, form: Fields): string | boolean[] {
    return type === 'ISIAN'
        ? form.getAll('jawaban').map(value => String(value).trim()).filter(Boolean).join('\n')
        : Array.from({ length: itemCount }, (_, index) => form.get('item-' + index) === 'true');
}

export function essayMarks(essays: { id: number; nilai: number | null; catatan?: string }[], form: Fields) {
    return essays.flatMap(essay => {
        const value = String(form.get('nilai-' + essay.id) ?? '').trim();
        const catatan = String(form.get('catatan-' + essay.id) ?? '').trim();
        if (!value || (Number(value) === essay.nilai && catatan === (essay.catatan ?? ''))) return [];
        return [{ soalId: essay.id, nilai: Number(value), catatan }];
    });
}

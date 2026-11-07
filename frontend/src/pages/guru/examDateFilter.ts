const jakartaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });

export function localDateTime(value: string) {
    const date = new Date(value);
    return new Date(+date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export function examOnDate(value: string, selected: string) {
    return examDateInRange(value, selected, selected);
}

export function examDateInRange(value: string, from: string, to: string) {
    if (!from && !to) return true;
    const date = new Date(value);
    if (!Number.isFinite(+date)) return false;
    const parts = jakartaDate.formatToParts(date);
    const part = (type: string) => parts.find(item => item.type === type)!.value;
    const key = `${part('year')}-${part('month')}-${part('day')}`;
    return (!from || key >= from) && (!to || key <= to);
}

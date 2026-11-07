export type ImportIssue = { row: number; message: string };

function rowSummary(values: number[]) {
    const rows = [...new Set(values)].sort((a, b) => a - b);
    const ranges: { first: number; last: number }[] = [];
    for (const row of rows) {
        const previous = ranges[ranges.length - 1];
        if (previous && row === previous.last + 1) previous.last = row;
        else ranges.push({ first: row, last: row });
    }
    const labels = ranges.slice(0, 8).map(range => range.first === range.last ? String(range.first) : range.first + '–' + range.last);
    const remaining = ranges.slice(8).reduce((sum, range) => sum + range.last - range.first + 1, 0);
    if (remaining) labels.push('dan ' + remaining + ' baris lainnya');
    return labels.join(', ');
}

export function summarizeImportIssues(issues: ImportIssue[]) {
    const grouped = new Map<string, number[]>();
    for (const issue of issues) {
        const rows = grouped.get(issue.message) ?? [];
        rows.push(issue.row);
        grouped.set(issue.message, rows);
    }
    const groups = [...grouped.entries()];
    const summaries = groups.slice(0, 5).map(([message, rows]) => message.replace(/\.$/, '') + ' — baris ' + rowSummary(rows) + '.');
    const remaining = groups.slice(5).reduce((sum, [, rows]) => sum + rows.length, 0);
    if (remaining) summaries.push(remaining + ' baris lainnya memiliki kesalahan berbeda.');
    return summaries;
}

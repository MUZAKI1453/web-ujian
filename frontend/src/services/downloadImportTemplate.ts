import api from './api';

export async function downloadImportTemplate(role: 'siswa' | 'guru') {
    const { data } = await api.get<Blob>('/admin/' + role + '/template', { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template-' + role + '.xlsx';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

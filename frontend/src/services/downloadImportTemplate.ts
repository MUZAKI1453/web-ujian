import api from './api';
import { saveBlob } from './nativeApp';

export async function downloadImportTemplate(role: 'siswa' | 'guru') {
    const { data } = await api.get<Blob>('/admin/' + role + '/template', { responseType: 'blob' });
    await saveBlob(data, 'template-' + role + '.xlsx');
}

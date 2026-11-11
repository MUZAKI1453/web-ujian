/// <reference types="vite/client" />
import axios from 'axios';

const defaultBaseUrl = import.meta.env.PROD
    ? '/api'
    : window.location.protocol + '//' + window.location.hostname + ':5000/api';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || defaultBaseUrl,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.set('Authorization', 'Bearer ' + token);
    return config;
});

api.interceptors.response.use(undefined, (error) => {
    if (error.response?.status === 401 && error.config?.url !== '/auth/login' && localStorage.getItem('token')) {
        if (error.response?.data?.code === 'SESI_BERAKHIR') sessionStorage.setItem('loginNotice', error.response.data.message);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
    }
    if (error.response?.status === 403 && error.response?.data?.code === 'WAJIB_GANTI_PASSWORD') {
        try {
            const user = JSON.parse(localStorage.getItem('user') || 'null');
            if (user && !user.passwordBawaan) {
                localStorage.setItem('user', JSON.stringify({ ...user, passwordBawaan: true }));
                window.location.reload();
            }
        } catch { /* Data pengguna lokal rusak; pengguna akan diminta login ulang. */ }
    }
    return Promise.reject(error);
});

// Gambar soal disajikan backend di /media. Saat pengembangan, frontend berjalan di port lain.
export function mediaUrl(source: string) {
    return source.startsWith('/media/') ? String(api.defaults.baseURL).replace(/\/api\/?$/, '') + source : source;
}

export default api;
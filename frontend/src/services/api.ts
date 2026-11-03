/// <reference types="vite/client" />
import axios from 'axios';

const api = axios.create({
    baseURL: (import.meta.env.VITE_API_BASE_URL || window.location.protocol + '//' + window.location.hostname + ':5000/api'),
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
    return Promise.reject(error);
});

export default api;
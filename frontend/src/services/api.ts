import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api', // Mengarah ke backend Express kita
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
import axios from 'axios';

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:3200/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;

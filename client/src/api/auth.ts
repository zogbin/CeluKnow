import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  register: (username: string, password: string) => api.post('/auth/register', { username, password }),
  me: () => api.get('/auth/me'),
};

export default api;
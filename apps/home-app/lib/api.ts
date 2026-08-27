import axios from 'axios';
import { GenerationJob } from './store';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
});

// Interceptor: Authorization ヘッダーを自動付与
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor: 401 エラー時はログインページへリダイレクト
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export const generateApp = async (payload: {
  description: string;
  appName: string;
  language: string;
  dbType: string;
  model: string;
}): Promise<GenerationJob> => {
  const response = await api.post('/api/generate', payload);
  return response.data;
};

export const getJob = async (jobId: string): Promise<GenerationJob> => {
  const response = await api.get(`/api/jobs/${jobId}`);
  return response.data;
};

export const approveDesign = async (jobId: string): Promise<GenerationJob> => {
  const response = await api.post(`/api/jobs/${jobId}/approve-design`);
  return response.data;
};

export const rejectDesign = async (jobId: string): Promise<GenerationJob> => {
  const response = await api.post(`/api/jobs/${jobId}/reject-design`);
  return response.data;
};

import axios from 'axios';
import { GenerationJob } from './store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface GenerateRequest {
  prompt: string;
  appName: string;
  language: string;
  temperature: number;
  dbType: string;
}

export interface GenerateResponse {
  jobId: string;
  status: string;
}

export const generateApp = async (data: GenerateRequest): Promise<GenerateResponse> => {
  const response = await api.post('/api/generate', data);
  return response.data;
};

export const approveDesign = async (jobId: string, designApproved: boolean): Promise<{ success: boolean }> => {
  const response = await api.post(`/api/jobs/${jobId}/approve-design`, {
    designApproved,
  });
  return response.data;
};

export const getJob = async (jobId: string): Promise<GenerationJob> => {
  const response = await api.get(`/api/jobs/${jobId}`);
  return response.data;
};

export default api;

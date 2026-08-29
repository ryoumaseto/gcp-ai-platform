import axios from 'axios';
import { GenerationJob } from './store';

// バックエンドの既定ポートは 3001（docker-compose / Dockerfile / .env.example と一致）
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
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

// Interceptor: トークンが無効・期限切れならログインページへ誘導する。
// バックエンドはトークン欠落で 401、検証失敗・期限切れで 403 を返すため両方を扱う
// (403 を無視するとトークン期限切れ後にユーザーが操作不能のまま取り残される)。
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export interface JobStats {
  /** デプロイ完了したアプリ数（表示用） */
  completed: number;
  /** 全ジョブ数 */
  total: number;
  /** 上限枠を消費しているジョブ数（失敗を除く = 生成中も含む） */
  used: number;
  limit: number;
  canCreate: boolean;
}

export const generateApp = async (payload: {
  description: string;
  appName: string;
  language: string;
  dbType: string;
  model: string;
}): Promise<GenerationJob> => {
  const response = await api.post('/api/jobs', payload);
  return response.data;
};

export interface GeminiModel {
  id: string;
  label: string;
}

// 利用可能なモデルはハードコードせず API から取得する
// （モデル ID は Google 側の都合で提供終了するため）
export const listModels = async (): Promise<{ models: GeminiModel[]; fallback: boolean }> => {
  const response = await api.get('/api/jobs/models');
  return response.data;
};

export const listJobs = async (): Promise<{ jobs: GenerationJob[]; stats: JobStats }> => {
  const response = await api.get('/api/jobs');
  return response.data;
};

export const deleteJob = async (jobId: string): Promise<void> => {
  await api.delete(`/api/jobs/${jobId}`);
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

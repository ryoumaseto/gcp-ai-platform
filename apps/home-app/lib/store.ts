import { create } from 'zustand';

export interface GenerationJob {
  id: string;
  status: 'pending' | 'design_generating' | 'design_review' | 'approved' | 'generating' | 'testing' | 'security_scan' | 'ready' | 'deployed' | 'failed';
  prompt: string;
  designDocument?: string;
  appName?: string;
  language?: string;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
  appUrl?: string;
  error?: string;
  progress?: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

interface JobStore {
  currentJob: GenerationJob | null;
  jobs: GenerationJob[];
  user: User | null;
  isLoading: boolean;

  setCurrentJob: (job: GenerationJob | null) => void;
  addJob: (job: GenerationJob) => void;
  updateJob: (id: string, updates: Partial<GenerationJob>) => void;
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useJobStore = create<JobStore>((set) => ({
  currentJob: null,
  jobs: [],
  user: null,
  isLoading: false,

  setCurrentJob: (job) => set({ currentJob: job }),

  addJob: (job) =>
    set((state) => ({
      jobs: [job, ...state.jobs],
      currentJob: job,
    })),

  updateJob: (id, updates) =>
    set((state) => {
      const newJobs = state.jobs.map((j) =>
        j.id === id ? { ...j, ...updates, updatedAt: new Date().toISOString() } : j
      );
      const isCurrentJob = state.currentJob?.id === id;
      return {
        jobs: newJobs,
        currentJob: isCurrentJob ? { ...state.currentJob, ...updates, updatedAt: new Date().toISOString() } : state.currentJob,
      };
    }),

  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}));

import { create } from 'zustand';

export interface GenerationJob {
  id: string;
  status: 'pending' | 'parsing' | 'design_review' | 'approved' | 'generating' | 'testing' | 'deployed' | 'failed';
  prompt: string;
  appName: string;
  language: 'TypeScript' | 'Python' | 'Go';
  dbType: 'PostgreSQL' | 'MySQL' | 'MongoDB';
  model: string;
  designDocument?: string;
  appUrl?: string;
  error?: string;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Store {
  currentJob: GenerationJob | null;
  jobs: GenerationJob[];
  isLoading: boolean;
  user: { id: string; email: string } | null;
  jobStats: { completed: number; total: number; limit: number; canCreate: boolean };

  setCurrentJob: (job: GenerationJob | null) => void;
  addJob: (job: GenerationJob) => void;
  updateJob: (id: string, updates: Partial<GenerationJob>) => void;
  setLoading: (loading: boolean) => void;
  setUser: (user: { id: string; email: string } | null) => void;
  setJobStats: (stats: Store['jobStats']) => void;
}

export const useStore = create<Store>((set) => ({
  currentJob: null,
  jobs: [],
  isLoading: false,
  user: null,
  jobStats: { completed: 0, total: 0, limit: 3, canCreate: true },

  setCurrentJob: (job) => set({ currentJob: job }),
  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
      currentJob:
        state.currentJob?.id === id ? { ...state.currentJob, ...updates } : state.currentJob,
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  setUser: (user) => set({ user }),
  setJobStats: (stats) => set({ jobStats: stats }),
}));

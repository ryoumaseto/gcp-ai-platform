'use client';

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useJobStore, GenerationJob } from '@/lib/store';

interface ProgressEvent {
  jobId: string;
  status: GenerationJob['status'];
  progress?: number;
  designDocument?: string;
  appUrl?: string;
  error?: string;
}

export function useProgressListener(jobId?: string) {
  const updateJob = useJobStore((state) => state.updateJob);

  useEffect(() => {
    if (!jobId) return;

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const socket: Socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('subscribe', { jobId });
    });

    socket.on('progress', (event: ProgressEvent) => {
      console.log('Progress update:', event);
      updateJob(event.jobId, {
        status: event.status,
        progress: event.progress,
        designDocument: event.designDocument,
        appUrl: event.appUrl,
        error: event.error,
      });
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    return () => {
      socket.disconnect();
    };
  }, [jobId, updateJob]);
}

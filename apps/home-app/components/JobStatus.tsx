'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useProgressListener } from '@/hooks/useProgressListener';
import { approveDesign, getJob } from '@/lib/api';
import { useJobStore, GenerationJob } from '@/lib/store';

const STATUS_LABELS: Record<GenerationJob['status'], string> = {
  pending: 'Pending',
  design_generating: 'Generating Design',
  design_review: 'Review Design',
  approved: 'Approved - Generating Code',
  generating: 'Generating Code',
  testing: 'Running Tests',
  security_scan: 'Security Scan',
  ready: 'Ready to Deploy',
  deployed: 'Deployed',
  failed: 'Failed',
};

const STATUS_COLORS: Record<GenerationJob['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  design_generating: 'bg-blue-100 text-blue-700',
  design_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  generating: 'bg-blue-100 text-blue-700',
  testing: 'bg-purple-100 text-purple-700',
  security_scan: 'bg-orange-100 text-orange-700',
  ready: 'bg-green-100 text-green-700',
  deployed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

const PROGRESS_STEPS = [
  { status: 'design_generating' as const, label: 'Design', progress: 20 },
  { status: 'design_review' as const, label: 'Review', progress: 40 },
  { status: 'generating' as const, label: 'Code', progress: 60 },
  { status: 'testing' as const, label: 'Tests', progress: 80 },
  { status: 'security_scan' as const, label: 'Security', progress: 90 },
  { status: 'ready' as const, label: 'Ready', progress: 100 },
];

interface Props {
  jobId: string;
}

export function JobStatus({ jobId }: Props) {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [showDesign, setShowDesign] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  useProgressListener(jobId);
  const { currentJob, updateJob } = useJobStore();

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const jobData = await getJob(jobId);
        setJob(jobData);
      } catch (error) {
        console.error('Error fetching job:', error);
      }
    };

    fetchJob();
    const interval = setInterval(fetchJob, 3000); // Poll every 3 seconds as fallback

    return () => clearInterval(interval);
  }, [jobId]);

  const displayJob = currentJob?.id === jobId ? currentJob : job;

  if (!displayJob) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="text-slate-600 mt-4">Loading job status...</p>
      </div>
    );
  }

  const handleApproveDesign = async (approved: boolean) => {
    setIsApproving(true);
    try {
      await approveDesign(jobId, approved);
      updateJob(jobId, { status: approved ? 'approved' : 'failed' });
      toast.success(approved ? 'Design approved! Code generation started.' : 'Design rejected.');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to process design decision');
    } finally {
      setIsApproving(false);
    }
  };

  const progressPercent = displayJob.progress ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{displayJob.appName}</h3>
            <p className="text-sm text-slate-600">{displayJob.prompt}</p>
          </div>
          <span
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              STATUS_COLORS[displayJob.status]
            }`}
          >
            {STATUS_LABELS[displayJob.status]}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-2">{progressPercent}% complete</p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="font-semibold text-slate-900 mb-4">Progress</h4>
        <div className="flex gap-2">
          {PROGRESS_STEPS.map((step, idx) => {
            const isCompleted =
              PROGRESS_STEPS.findIndex((s) => s.status === displayJob.status) >= idx;
            return (
              <div
                key={step.status}
                className={`flex-1 py-2 px-3 rounded-lg text-center text-xs font-medium transition ${
                  isCompleted
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {step.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Design Review */}
      {displayJob.status === 'design_review' && displayJob.designDocument && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-semibold text-slate-900 mb-4">Design Document</h4>
          <button
            onClick={() => setShowDesign(!showDesign)}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
          >
            {showDesign ? '▼ Hide Design' : '▶ Show Design'}
          </button>

          {showDesign && (
            <div className="bg-slate-50 rounded p-4 mb-6 max-h-96 overflow-y-auto">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                {displayJob.designDocument}
              </pre>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => handleApproveDesign(true)}
              disabled={isApproving}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              {isApproving ? 'Processing...' : '✓ Approve & Generate Code'}
            </button>
            <button
              onClick={() => handleApproveDesign(false)}
              disabled={isApproving}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              {isApproving ? 'Processing...' : '✗ Reject'}
            </button>
          </div>
        </div>
      )}

      {/* Completion */}
      {displayJob.status === 'deployed' && displayJob.appUrl && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-6">
          <h4 className="font-semibold text-emerald-900 mb-2">✓ App Deployed!</h4>
          <p className="text-emerald-700 mb-4">Your app is now live and ready to use.</p>
          <a
            href={displayJob.appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            Open App →
          </a>
        </div>
      )}

      {/* Error */}
      {displayJob.status === 'failed' && displayJob.error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
          <h4 className="font-semibold text-red-900 mb-2">✗ Generation Failed</h4>
          <p className="text-red-700">{displayJob.error}</p>
        </div>
      )}
    </div>
  );
}

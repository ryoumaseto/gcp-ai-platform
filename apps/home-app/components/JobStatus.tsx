'use client';

import { useEffect, useState } from 'react';
import { useStore, GenerationJob } from '@/lib/store';
import { getJob, approveDesign, rejectDesign } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import toast from 'react-hot-toast';

interface JobStatusProps {
  jobId: string;
}

export default function JobStatus({ jobId }: JobStatusProps) {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDesign, setShowDesign] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchJob = async () => {
      try {
        const data = await getJob(jobId);
        setJob(data);

        // Terminal state に到達したら polling 停止
        if (data.status === 'deployed' || data.status === 'failed') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Failed to fetch job:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJob();
    interval = setInterval(fetchJob, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  if (isLoading || !job) return <div>読み込み中...</div>;

  const statusLabels: Record<string, string> = {
    pending: '待機中',
    parsing: '解析中',
    generating: '生成中',
    testing: 'テスト中',
    design_review: '設計レビュー',
    approved: '承認済み',
    deployed: 'デプロイ完了',
    failed: 'エラー',
  };

  const handleApprove = async () => {
    try {
      const updated = await approveDesign(jobId);
      setJob(updated);
      toast.success('設計を承認しました');
    } catch (error) {
      toast.error('エラーが発生しました');
    }
  };

  const handleReject = async () => {
    try {
      const updated = await rejectDesign(jobId);
      setJob(updated);
      toast.error('設計を却下しました');
    } catch (error) {
      toast.error('エラーが発生しました');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>{job.appName}</span>
          <span className="text-sm font-normal px-3 py-1 bg-blue-100 text-blue-800 rounded">
            {statusLabels[job.status] ?? job.status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">進捗</span>
            <span className="text-sm text-gray-600">{job.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>

        {job.status === 'design_review' && job.designDocument && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowDesign(!showDesign)}
            >
              {showDesign ? '設計書を隠す' : '設計書を表示'}
            </Button>

            {showDesign && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap">{job.designDocument}</pre>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleApprove}
              >
                承認
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={handleReject}
              >
                却下
              </Button>
            </div>
          </div>
        )}

        {job.status === 'deployed' && job.appUrl && (
          <div className="space-y-3">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">アプリがデプロイされました</p>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => window.open(job.appUrl, '_blank')}
            >
              アプリを開く
            </Button>
          </div>
        )}

        {job.status === 'failed' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">エラー: {job.error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

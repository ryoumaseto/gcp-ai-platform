'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Job {
  id: string;
  appName: string;
  status: string;
  progress: number;
  appUrl?: string;
  error?: string;
  createdAt: string;
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, limit: 3, canCreate: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/auth/login');
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch jobs');

      const data = await response.json();
      setJobs(data.jobs || data);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      toast.error('ジョブの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('このアプリを削除してもよろしいですか？')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Delete failed');

      toast.success('アプリを削除しました');
      fetchJobs();
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '待機中',
      parsing: 'パース中',
      design_review: '設計書レビュー',
      approved: '承認済み',
      generating: '生成中',
      testing: 'テスト中',
      deployed: '✅ デプロイ完了',
      failed: '❌ 失敗',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      deployed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      generating: 'bg-blue-100 text-blue-800',
      design_review: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">AG</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">AppGen</h1>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">生成済み: {stats.completed}/{stats.limit}</span>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ホーム
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">マイアプリ</h2>
          <p className="text-gray-600">
            作成したアプリの一覧です。最大{stats.limit}個まで作成できます。
          </p>
        </div>

        {/* Stats Card */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">作成済みアプリ</p>
                <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">制限</p>
                <p className="text-3xl font-bold text-gray-900">{stats.limit}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">作成可能</p>
                <p className={`text-3xl font-bold ${stats.canCreate ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.canCreate ? '○' : '✕'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {!stats.canCreate && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-800 font-semibold mb-2">⚠️ 作成上限に達しています</p>
            <p className="text-sm text-red-700">
              新しいアプリを作成するには、古いアプリを削除してください。
            </p>
          </div>
        )}

        {/* Jobs List */}
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <p className="text-gray-600 mb-6">まだアプリを作成していません。</p>
              <Link href="/">
                <Button>アプリを作成する</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{job.appName}</h3>
                      <div className="flex items-center gap-4 mb-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
                            job.status
                          )}`}
                        >
                          {getStatusLabel(job.status)}
                        </span>
                        {job.status !== 'deployed' && job.status !== 'failed' && (
                          <div className="flex-1 max-w-xs">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{job.progress}%</p>
                          </div>
                        )}
                      </div>
                      {job.error && <p className="text-sm text-red-600 mb-2">エラー: {job.error}</p>}
                      <p className="text-xs text-gray-500">
                        作成日: {new Date(job.createdAt).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {job.appUrl && (
                        <a
                          href={job.appUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
                        >
                          開く
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm font-semibold"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

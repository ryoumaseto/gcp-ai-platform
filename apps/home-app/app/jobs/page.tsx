'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileSearch,
  Loader2,
  Sparkles,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listJobs, deleteJob } from '@/lib/api';
import { useStore, GenerationJob } from '@/lib/store';

const TERMINAL_STATUSES = ['deployed', 'failed'];

const STATUS_META: Record<
  string,
  { label: string; className: string; Icon: typeof Clock }
> = {
  pending: { label: '待機中', className: 'bg-gray-100 text-gray-700', Icon: Clock },
  parsing: { label: '解析中', className: 'bg-blue-100 text-blue-800', Icon: Loader2 },
  generating: { label: '生成中', className: 'bg-blue-100 text-blue-800', Icon: Loader2 },
  testing: { label: 'テスト中', className: 'bg-blue-100 text-blue-800', Icon: Loader2 },
  design_review: { label: '設計書レビュー待ち', className: 'bg-amber-100 text-amber-800', Icon: FileSearch },
  approved: { label: '承認済み', className: 'bg-indigo-100 text-indigo-800', Icon: CheckCircle2 },
  deployed: { label: 'デプロイ完了', className: 'bg-green-100 text-green-800', Icon: CheckCircle2 },
  failed: { label: '失敗', className: 'bg-red-100 text-red-800', Icon: XCircle },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, className: 'bg-gray-100 text-gray-700', Icon: Clock };
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { jobStats: stats, setJobStats } = useStore();

  const fetchJobs = async () => {
    try {
      const data = await listJobs();
      setJobs(data.jobs);
      setJobStats(data.stats);
    } catch (error) {
      // 401 は api クライアントの interceptor がログイン画面へ誘導する
      toast.error('アプリ一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/auth/login');
      return;
    }
    fetchJobs();
  }, []);

  // 生成中のジョブがある間だけポーリングする
  useEffect(() => {
    const hasActiveJob = jobs.some((job) => !TERMINAL_STATUSES.includes(job.status));
    if (!hasActiveJob) return;

    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  const handleDelete = async (jobId: string) => {
    if (!confirm('このアプリを削除してもよろしいですか？')) return;

    try {
      await deleteJob(jobId);
      toast.success('アプリを削除しました');
      fetchJobs();
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          読み込み中...
        </p>
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
            <span className="text-sm text-gray-600">
              使用中: {stats.used}/{stats.limit}
            </span>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ホーム
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">マイアプリ</h2>
          <p className="text-gray-600">
            作成したアプリの一覧です。最大{stats.limit}個まで作成できます。
          </p>
        </div>

        {/* Stats */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">使用中の枠</p>
                <p className="text-3xl font-bold text-gray-900">{stats.used}</p>
                <p className="text-xs text-gray-500 mt-1">
                  うちデプロイ完了 {stats.completed}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">上限</p>
                <p className="text-3xl font-bold text-gray-900">{stats.limit}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">新規作成</p>
                <p
                  className={`flex items-center gap-2 text-lg font-semibold ${
                    stats.canCreate ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {stats.canCreate ? (
                    <>
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                      可能
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5" aria-hidden />
                      上限到達
                    </>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {!stats.canCreate && (
          <div className="flex gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-red-800 font-semibold mb-1">作成上限に達しています</p>
              <p className="text-sm text-red-700">
                新しいアプリを作成するには、古いアプリを削除してください。
              </p>
            </div>
          </div>
        )}

        {/* Jobs List */}
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-gray-600 mb-6">まだアプリを作成していません。</p>
              <Link href="/">
                <Button>アプリを作成する</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => {
              const { label, className, Icon } = statusMeta(job.status);
              const inProgress = !TERMINAL_STATUSES.includes(job.status);

              return (
                <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{job.appName}</h3>

                    {/* スペック */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded text-sm text-gray-700">
                        <Terminal className="h-3.5 w-3.5" aria-hidden />
                        {job.language}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded text-sm text-gray-700">
                        <Database className="h-3.5 w-3.5" aria-hidden />
                        {job.dbType}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded text-sm text-gray-700">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        {job.model}
                      </span>
                    </div>

                    {job.prompt && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{job.prompt}</p>
                    )}

                    {/* ステータス */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${className}`}
                        >
                          <Icon
                            className={`h-4 w-4 ${inProgress && job.status !== 'design_review' ? 'animate-spin' : ''}`}
                            aria-hidden
                          />
                          {label}
                        </span>
                        {inProgress && (
                          <span className="text-xs text-gray-500">{job.progress}%</span>
                        )}
                      </div>

                      {inProgress && (
                        <div
                          className="w-full bg-gray-200 rounded-full h-2 mb-4"
                          role="progressbar"
                          aria-valuenow={job.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      )}

                      {/* URL は完了時のみ表示 */}
                      {job.status === 'deployed' && job.appUrl && (
                        <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-100">
                          <p className="text-xs text-gray-600 mb-1">アプリ URL</p>
                          <a
                            href={job.appUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline break-all"
                          >
                            {job.appUrl}
                          </a>
                        </div>
                      )}

                      {job.error && (
                        <p className="flex gap-2 text-sm text-red-600 mb-3">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                          {job.error}
                        </p>
                      )}

                      <p className="text-xs text-gray-500">
                        作成日: {new Date(job.createdAt).toLocaleString('ja-JP')}
                      </p>
                    </div>

                    {/* アクション */}
                    <div className="flex gap-2 justify-end border-t mt-4 pt-4">
                      {job.status === 'design_review' && (
                        <Link href={`/?job=${job.id}`}>
                          <Button variant="outline" className="gap-1.5">
                            <FileSearch className="h-4 w-4" aria-hidden />
                            設計書を確認
                          </Button>
                        </Link>
                      )}
                      {job.status === 'deployed' && job.appUrl && (
                        <a href={job.appUrl} target="_blank" rel="noopener noreferrer">
                          <Button className="gap-1.5">
                            <ExternalLink className="h-4 w-4" aria-hidden />
                            開く
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="destructive"
                        onClick={() => handleDelete(job.id)}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        削除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

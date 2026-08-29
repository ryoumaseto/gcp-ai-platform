'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useStore } from '@/lib/store';
import { generateApp, listJobs, listModels, GeminiModel } from '@/lib/api';
import toast from 'react-hot-toast';

interface PromptFormProps {
  onJobCreated?: (jobId: string) => void;
}

export default function PromptForm({ onJobCreated }: PromptFormProps) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [appName, setAppName] = useState('');
  const [language, setLanguage] = useState('TypeScript');
  const [dbType, setDbType] = useState('PostgreSQL');
  const [model, setModel] = useState('gemini-flash-latest');
  const [models, setModels] = useState<GeminiModel[]>([
    { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [canCreate, setCanCreate] = useState(true);

  const { setCurrentJob, setLoading, jobStats, setJobStats } = useStore();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token);
    setCanCreate(jobStats.canCreate);
  }, [jobStats]);

  // 実際に使えるモデルを取得して選択肢に反映する
  useEffect(() => {
    if (!localStorage.getItem('token')) return;

    listModels()
      .then((data) => {
        if (data.models.length === 0) return;
        setModels(data.models);
        // 取得したリストに現在の選択が無ければ先頭に寄せる
        setModel((current) =>
          data.models.some((m) => m.id === current) ? current : data.models[0].id
        );
      })
      .catch(() => {
        /* 取得に失敗しても既定のモデルで生成できるようにする */
      });
  }, [isLoggedIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoggedIn) {
      toast.error('ログインが必要です');
      router.push('/auth/login');
      return;
    }

    if (!canCreate) {
      toast.error('アプリの生成上限に達しています');
      router.push('/jobs');
      return;
    }

    if (!description.trim() || !appName.trim()) {
      toast.error('説明とアプリ名を入力してください');
      return;
    }

    // サーバー側と同じ制約を先に確認して、400 を返される前に伝える
    if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
      toast.error('アプリ名は英数字・ハイフン・アンダースコアのみ使用できます');
      return;
    }

    try {
      setIsLoading(true);
      setLoading(true);

      const job = await generateApp({
        description,
        appName,
        language,
        dbType,
        model,
      });

      setCurrentJob(job);
      onJobCreated?.(job.id);

      // 作成数が変わるので上限の判定を更新する
      listJobs()
        .then((data) => setJobStats(data.stats))
        .catch(() => {
          /* 一覧取得の失敗で生成完了の通知は妨げない */
        });

      toast.success('アプリ生成を開始しました');
      setDescription('');
      setAppName('');
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'エラーが発生しました。もう一度お試しください。';
      toast.error(message);
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="description">アプリの説明</Label>
        <textarea
          id="description"
          placeholder="例：ブログ投稿管理システム"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="appName">アプリ名</Label>
        <Input
          id="appName"
          placeholder="MyBlogApp"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="language">言語</Label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
          >
            <option>TypeScript</option>
            <option>Python</option>
            <option>Go</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dbType">データベース</Label>
          <select
            id="dbType"
            value={dbType}
            onChange={(e) => setDbType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
          >
            <option>PostgreSQL</option>
            <option>MySQL</option>
            <option>MongoDB</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">Gemini モデル</Label>
        <select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {!isLoggedIn && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 mb-3">
            アプリを生成するには、ログインが必要です。
          </p>
          <Link href="/auth/login">
            <Button type="button" className="w-full">
              ログインする
            </Button>
          </Link>
        </div>
      )}

      {isLoggedIn && !canCreate && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 mb-3">
            アプリの生成上限に達しています。古いアプリを削除してから新規作成してください。
          </p>
          <Link href="/jobs">
            <Button type="button" className="w-full bg-red-600 hover:bg-red-700">
              マイアプリで管理
            </Button>
          </Link>
        </div>
      )}

      {isLoggedIn && canCreate && (
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? '生成中...' : 'アプリを生成'}
        </Button>
      )}
    </form>
  );
}

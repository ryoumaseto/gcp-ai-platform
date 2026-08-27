'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from 'react-hot-toast';
import PromptForm from '@/components/PromptForm';
import JobStatus from '@/components/JobStatus';
import { useStore } from '@/lib/store';

interface User {
  id: string;
  email: string;
}

export default function HomePage() {
  const router = useRouter();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { jobStats } = useStore();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/');
  };

  return (
    <>
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
              {user ? (
                <>
                  <Link href="/jobs" className="text-sm text-gray-600 hover:text-gray-900">
                    マイアプリ ({jobStats.completed}/{jobStats.limit})
                  </Link>
                  <div className="relative group">
                    <button className="text-sm text-gray-600 hover:text-gray-900 font-semibold">
                      {user.email}
                    </button>
                    <div className="hidden group-hover:block absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        ログアウト
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">
                    ログイン
                  </Link>
                  <Link href="/auth/signup" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    サインアップ
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left: Hero Text */}
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest">
                  Powered by AI
                </p>
                <h2 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                  説明から
                  <br />
                  アプリを
                  <br />
                  <span className="text-blue-600">自動生成</span>
                </h2>
              </div>
              <p className="text-lg text-gray-600">
                AI が設計書を作成して、本番環境にデプロイするまで自動化します。
                わずか数分であなたのアプリが完成します。
              </p>
            </div>

            {/* Right: Form Card */}
            <div className="lg:sticky lg:top-24">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-blue-600">アプリを生成</CardTitle>
                  <CardDescription>説明を入力して AI が設計書を作成します</CardDescription>
                </CardHeader>
                <CardContent>
                  <PromptForm onJobCreated={setSelectedJobId} />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Job Status Section */}
        {selectedJobId && (
          <section className="max-w-6xl mx-auto px-6 pb-20">
            <h3 className="text-3xl font-bold text-gray-900 mb-8">生成進捗</h3>
            <JobStatus jobId={selectedJobId} />
          </section>
        )}

        {/* Features Section */}
        <section className="bg-white border-t border-gray-200 py-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">特徴</h2>
              <p className="text-gray-600">AppGen なら、複雑なアプリケーション開発を数分で完了</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: '高速生成',
                  description: '設計からデプロイまで、わずか数分で完了。従来の開発時間を大幅に削減します。',
                },
                {
                  title: '品質管理',
                  description: '生成された設計書をレビュー・承認してからコード生成を開始。品質を確保します。',
                },
                {
                  title: 'すぐに利用',
                  description: '完成後、専用 URL ですぐにアプリを利用・カスタマイズ可能です。',
                },
              ].map((feature, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-gray-50 py-8">
          <div className="max-w-6xl mx-auto px-6 text-center text-gray-600 text-sm">
            <p>© 2025 AppGen. All rights reserved.</p>
          </div>
        </footer>
      </div>

      <Toaster position="top-right" />
    </>
  );
}

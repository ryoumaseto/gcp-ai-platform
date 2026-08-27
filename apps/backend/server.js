const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// ===== In-memory Job Store (開発用) =====
const jobsStore = {};

// ===== ジョブ進捗シミュレーション =====
async function simulateJobProgress(jobId) {
  const job = jobsStore[jobId];
  if (!job) return;

  const stages = [
    { progress: 10, status: 'pending', delay: 2 },
    { progress: 30, status: 'design_review', delay: 2 },
    { progress: 60, status: 'approved', delay: 2 },
    { progress: 100, status: 'deployed', delay: 2 },
  ];

  for (const stage of stages) {
    await new Promise(resolve => setTimeout(resolve, stage.delay * 1000));

    if (jobsStore[jobId]) {
      jobsStore[jobId].progress = stage.progress;
      jobsStore[jobId].status = stage.status;
      jobsStore[jobId].updatedAt = new Date();

      // design_reviewステップで設計書を追加
      if (stage.status === 'design_review' && !jobsStore[jobId].designDocument) {
        jobsStore[jobId].designDocument = `
# ${jobsStore[jobId].appName} 設計書

## 要件
- 説明: ${jobsStore[jobId].prompt}
- 言語: ${jobsStore[jobId].language}
- DB: ${jobsStore[jobId].dbType}
- AIモデル: ${jobsStore[jobId].model}

## アーキテクチャ
- フロントエンド: Next.js/React
- バックエンド: ${jobsStore[jobId].language}
- データベース: ${jobsStore[jobId].dbType}
- AI生成エンジン: ${jobsStore[jobId].model} (Gemini)

## 機能一覧
1. ユーザー認証
2. CRUD操作
3. API インタフェース
4. エラーハンドリング
5. Gemini統合コード生成

## セキュリティ
- JWT認証
- HTTPS通信
- SQL injection対策
- CORS設定
- APIキー管理 (Secret Manager)

## デプロイ
- Cloud Run でコンテナ化
- Cloud SQL との連携
- Gemini API認証
- 環境変数管理
`;
      }

      // deployedステップでURLを追加
      if (stage.status === 'deployed' && !jobsStore[jobId].appUrl) {
        jobsStore[jobId].appUrl = `https://${jobsStore[jobId].appName.toLowerCase()}.example.com`;
      }
    }
  }
}

// ===== API Endpoints =====

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// アプリ生成ジョブを作成
app.post('/api/generate', (req, res) => {
  try {
    const { description, appName, language = 'TypeScript', dbType = 'PostgreSQL', model = 'gemini-2.0-flash' } = req.body;

    if (!description || !appName) {
      return res.status(400).json({ error: 'description と appName は必須' });
    }

    const jobId = uuidv4();
    const now = new Date();

    const job = {
      id: jobId,
      status: 'pending',
      prompt: description,
      appName,
      language,
      dbType,
      model,
      designDocument: null,
      appUrl: null,
      error: null,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    jobsStore[jobId] = job;

    // バックグラウンドで進捗をシミュレート
    simulateJobProgress(jobId).catch(console.error);

    res.json(job);
  } catch (error) {
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ジョブの状態を取得
app.get('/api/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;

  if (!jobsStore[jobId]) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(jobsStore[jobId]);
});

// 設計書を承認
app.post('/api/jobs/:jobId/approve-design', (req, res) => {
  const { jobId } = req.params;

  if (!jobsStore[jobId]) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const job = jobsStore[jobId];

  if (job.status !== 'design_review') {
    return res.status(400).json({ error: 'Job must be in design_review status' });
  }

  job.status = 'approved';
  job.progress = 50;
  job.updatedAt = new Date();

  res.json(job);
});

// 設計書を却下
app.post('/api/jobs/:jobId/reject-design', (req, res) => {
  const { jobId } = req.params;

  if (!jobsStore[jobId]) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const job = jobsStore[jobId];

  if (job.status !== 'design_review') {
    return res.status(400).json({ error: 'Job must be in design_review status' });
  }

  job.status = 'pending';
  job.progress = 0;
  job.designDocument = null;
  job.updatedAt = new Date();

  res.json(job);
});

// 全ジョブのリスト
app.get('/api/jobs', (req, res) => {
  res.json(Object.values(jobsStore));
});

// ===== Server Start =====
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`✓ Backend API running on http://${HOST}:${PORT}`);
  console.log(`✓ Frontend connected to http://localhost:${PORT}`);
  console.log(`✓ API Docs: POST /api/generate, GET /api/jobs/:id`);
});

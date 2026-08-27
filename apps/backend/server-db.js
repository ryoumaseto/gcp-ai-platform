const express = require('express');
const cors = require('cors');
require('dotenv').config();
const sequelize = require('./config/database');
const models = require('./models');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// ===== API Routes =====

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: sequelize.authenticate() ? 'connected' : 'disconnected' });
});

// Auth routes (no token required)
app.use('/auth', authRoutes);

// Job routes (token required)
app.use('/api/jobs', jobRoutes);

// ===== Legacy API (開発互換性) =====
// トークンなしで試せるエンドポイント（開発用）
app.post('/api/generate', async (req, res) => {
  try {
    const { description, appName, language, dbType, model } = req.body;

    if (!description || !appName) {
      return res.status(400).json({ error: 'description と appName は必須' });
    }

    // ダミーユーザーID（開発用）
    const dummyUserId = '00000000-0000-0000-0000-000000000000';

    const job = await models.Job.create({
      userId: dummyUserId,
      appName,
      prompt: description,
      language: language || 'TypeScript',
      dbType: dbType || 'PostgreSQL',
      model: model || 'gemini-2.0-flash',
      status: 'pending',
      progress: 0,
    });

    // バックグラウンドで進捗をシミュレート
    simulateJobProgress(job.id).catch(console.error);

    res.json(job);
  } catch (error) {
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await models.Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error in GET /api/jobs/:jobId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/jobs/:jobId/approve-design', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await models.Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'design_review') {
      return res.status(400).json({ error: 'Job must be in design_review status' });
    }

    job.status = 'approved';
    job.progress = 50;
    await job.save();

    res.json(job);
  } catch (error) {
    console.error('Error in approveDesign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/jobs/:jobId/reject-design', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await models.Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'design_review') {
      return res.status(400).json({ error: 'Job must be in design_review status' });
    }

    job.status = 'pending';
    job.progress = 0;
    job.designDocument = null;
    await job.save();

    res.json(job);
  } catch (error) {
    console.error('Error in rejectDesign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Database initialization =====
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✓ データベース接続成功');

    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    console.log('✓ テーブル同期完了');

    return true;
  } catch (error) {
    console.error('❌ データベース初期化エラー:', error.message);
    return false;
  }
}

// ===== Job progress simulation =====
async function simulateJobProgress(jobId) {
  const stages = [
    { progress: 10, status: 'pending', delay: 2 },
    { progress: 30, status: 'design_review', delay: 2 },
  ];

  for (const stage of stages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay * 1000));

    const job = await models.Job.findByPk(jobId);
    if (job) {
      job.progress = stage.progress;
      job.status = stage.status;

      if (stage.status === 'design_review' && !job.designDocument) {
        job.designDocument = `
# ${job.appName} 設計書

## 要件
- 説明: ${job.prompt}
- 言語: ${job.language}
- DB: ${job.dbType}
- AIモデル: ${job.model}

## アーキテクチャ
- フロントエンド: Next.js/React
- バックエンド: ${job.language}
- データベース: ${job.dbType}
- AI: Gemini (${job.model})

## 機能
1. ユーザー認証 (JWT)
2. CRUD操作
3. REST API
4. エラーハンドリング
5. Gemini統合コード生成

## セキュリティ
- JWT認証 & 認可
- HTTPS通信
- SQL injection対策
- CORS設定
- APIキー管理 (Secret Manager)
- パスワード暗号化 (bcrypt)
`;
      }

      await job.save();
    }
  }
}

// ===== Server startup =====
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const dbReady = await initializeDatabase();

  if (!dbReady) {
    console.warn('⚠️  メモリモードで起動します（DB無し）');
  }

  app.listen(PORT, HOST, () => {
    console.log(`✓ バックエンド API running on http://${HOST}:${PORT}`);
    console.log(`✓ 認証: POST /auth/signup, /auth/login`);
    console.log(`✓ ジョブ: /api/jobs/... (JWT token required)`);
    console.log(`✓ 開発用: /api/generate (token不要)`);
  });
}

start().catch(console.error);

module.exports = app;

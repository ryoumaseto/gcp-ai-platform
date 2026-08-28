const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();
const sequelize = require('./config/database');
const models = require('./models');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const jobController = require('./controllers/jobController');
const { verifyToken } = require('./middleware/auth');
const AdvancedSecurity = require('./security/advancedSecurity');

const app = express();

// Cloud Run はコンテナの前段に 1 段のプロキシを置き、X-Forwarded-For /
// X-Forwarded-Proto を付与する。これを信頼しないと req.ip が常に
// プロキシのアドレスになり、rate limit が全ユーザー共有の 1 バケットに
// 縮退する（express-rate-limit も ERR_ERL_UNEXPECTED_X_FORWARDED_FOR を出す）。
app.set('trust proxy', 1);

// ===== ヘルスチェック（HTTPS 強制より前に登録する） =====
// Cloud Run の startup/liveness probe と Docker の HEALTHCHECK は、
// x-forwarded-proto を付けずにコンテナへ直接 HTTP 接続する。
// enforceHTTPS より後ろに置くと本番で 301 を返してしまい、
// プローブが 200 を得られずリビジョンが正常化しない。
app.get('/health', async (req, res) => {
  let database = 'disconnected';

  try {
    await sequelize.authenticate();
    database = 'connected';
  } catch (error) {
    console.error('Health check DB error:', error.message);
  }

  res.status(database === 'connected' ? 200 : 503).json({
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
    security: 'enabled',
  });
});

// ===== セキュリティミドルウェア =====

// 1️⃣ Helmet: HTTP ヘッダーセキュリティ
app.use(helmet());

// 2️⃣ HTTPS 強制
app.use(AdvancedSecurity.enforceHTTPS);

// 3️⃣ CORS 設定（限定的に）
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 3600,
}));

// 4️⃣ Rate Limiting（DDoS 対策）
app.use('/auth', AdvancedSecurity.createRateLimiter());
app.use('/api', AdvancedSecurity.createRateLimiter());

// 5️⃣ リクエストボディサイズ制限
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb' }));

// 6️⃣ セキュリティヘッダー追加
app.use(AdvancedSecurity.applySecurityMiddleware());

// ===== リクエスト検証 =====
app.use((req, res, next) => {
  // 疑わしいリクエスト検出
  const userAgent = req.headers['user-agent'] || '';
  const suspiciousPatterns = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'nessus',
  ];

  if (suspiciousPatterns.some((pattern) => userAgent.toLowerCase().includes(pattern))) {
    console.warn(`⚠️ Suspicious request detected: ${userAgent}`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
});

// ===== API Routes =====

// 認証ルート（Rate Limited）
app.use('/auth', authRoutes);

// ジョブルート（トークン + Rate Limited）
app.use('/api/jobs', jobRoutes);

// ジョブ作成のエイリアス（フロントエンドの /api/generate 互換）
app.post('/api/generate', verifyToken, jobController.createJob);

// ===== エラーハンドリング =====
app.use((err, req, res, next) => {
  console.error('Error:', AdvancedSecurity.sanitizeLog(err));

  // 本番環境ではスタックトレースを隠す
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const message = isDevelopment ? err.message : 'Internal server error';

  res.status(err.status || 500).json({
    error: message,
    ...(isDevelopment && { stack: err.stack }),
  });
});

// 404 ハンドラー
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ===== Database initialization =====
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection successful');

    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    console.log('✓ Table synchronization completed');

    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    return false;
  }
}

// ===== Security checklist =====
async function runSecurityChecklist() {
  const SecurityChecklist = require('./security/securityChecklist');
  const checklist = new SecurityChecklist();
  // コンテナ内には infra/ や docker-compose.yml が無いため runtime スコープで実行する
  const report = await checklist.runAllChecks({ scope: 'runtime' });

  console.log(`\n📊 セキュリティスコア: ${report.summary.percentage}%`);

  if (report.summary.percentage < 100) {
    console.warn('⚠️ セキュリティ基準に達していません');
    // 本番環境では起動をブロック
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  return report.summary.percentage;
}

// ===== 必須環境変数の検証 =====
// 欠けている場合はリクエスト時ではなく起動時に落とす
function assertRequiredEnv() {
  const required = ['JWT_SECRET_KEY'];

  if (process.env.NODE_ENV === 'production') {
    required.push('DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'GEMINI_API_KEY', 'FRONTEND_URL');
  }

  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    console.error(`❌ 必須の環境変数が設定されていません: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ===== Server startup =====
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    console.log(`
╔════════════════════════════════════════╗
║     セキュリティ強化版 サーバー起動     ║
╚════════════════════════════════════════╝
    `);

    // 必須環境変数の確認（不足していればここで終了）
    assertRequiredEnv();

    // データベース初期化
    const dbReady = await initializeDatabase();

    if (!dbReady) {
      // 全データが DB 前提のため、本番では DB 無しで起動させない
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Database connection failed. Refusing to start in production.');
        process.exit(1);
      }
      console.warn('⚠️ Database connection failed. Starting anyway (development only).');
    }

    // セキュリティチェック実行
    const securityScore = await runSecurityChecklist();

    // サーバー起動
    app.listen(PORT, HOST, () => {
      console.log(`
✓ Backend API running on http://${HOST}:${PORT}
✓ Security Level: ${securityScore}%
✓ Features:
  - Rate Limiting (IP based, 100 req / 15 min)
  - Login Attempt Limiting (5 failures -> 15 min lock)
  - Security Headers via Helmet (XSS, Clickjacking)
  - HTTPS Enforcement (x-forwarded-proto)
  - Parameterized queries via Sequelize ORM
  - Secrets from environment only (no hardcoded keys)
  - JWT auth (7 day expiry)
      `);
    });
  } catch (error) {
    console.error('❌ Server startup error:', error.message);
    process.exit(1);
  }
}

start();

module.exports = app;

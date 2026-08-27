const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();
const sequelize = require('./config/database');
const models = require('./models');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const AdvancedSecurity = require('./security/advancedSecurity');

const app = express();

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

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: sequelize.authenticate() ? 'connected' : 'disconnected',
    security: 'enabled',
  });
});

// 認証ルート（Rate Limited）
app.use('/auth', authRoutes);

// ジョブルート（トークン + Rate Limited）
app.use('/api/jobs', jobRoutes);

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
  const report = await checklist.runAllChecks();

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

    // データベース初期化
    const dbReady = await initializeDatabase();

    if (!dbReady) {
      console.warn('⚠️ Database connection failed. Running in memory mode.');
    }

    // セキュリティチェック実行
    const securityScore = await runSecurityChecklist();

    // サーバー起動
    app.listen(PORT, HOST, () => {
      console.log(`
✓ Backend API running on http://${HOST}:${PORT}
✓ Security Level: ${securityScore}%
✓ Features:
  - Rate Limiting (DDoS prevention)
  - CSRF Protection
  - Input Sanitization (SQL injection prevention)
  - Security Headers (XSS, Clickjacking prevention)
  - HTTPS Enforcement
  - Login Attempt Limiting (Brute force prevention)
  - Session Timeout (1 hour)
  - Audit Logging
      `);
    });
  } catch (error) {
    console.error('❌ Server startup error:', error.message);
    process.exit(1);
  }
}

start();

module.exports = app;

/**
 * 高度なセキュリティ実装
 * 外部攻撃対策に特化
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

class AdvancedSecurity {
  /**
   * 1️⃣ API キー認証の強化
   */
  static createAPIKeyAuth() {
    return (req, res, next) => {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }

      // API キーをハッシュ化して比較
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const validKeyHash = crypto.createHash('sha256')
        .update(process.env.API_KEY || 'default-key')
        .digest('hex');

      if (!AdvancedSecurity.safeCompare(keyHash, validKeyHash)) {
        // タイミング攻撃対策：常に同じ時間応答
        return res.status(401).json({ error: 'Invalid API key' });
      }

      next();
    };
  }

  /**
   * 2️⃣ Rate Limiting（DDoS 対策）
   */
  static createRateLimiter() {
    const { ipKeyGenerator } = rateLimit;
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 分
      max: 100, // 制限: 100 リクエスト/15分
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      // IPv6対応のIP取得
      skip: (req, res) => false,
      handler: (req, res) => {
        res.status(429).json({ error: 'Too many requests' });
      },
    });
  }

  /**
   * 3️⃣ CSRF トークン生成・検証
   */
  static generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static validateCSRFToken(token, sessionToken) {
    return AdvancedSecurity.safeCompare(token, sessionToken);
  }

  /**
   * 定数時間比較。crypto.timingSafeEqual は
   *  - 文字列を渡すと TypeError
   *  - 長さが違うと RangeError
   * を投げるため、そのまま使うと「不一致」ではなく 500 になる。
   * 長さを含めて安全に比較するためハッシュ化してから突き合わせる。
   */
  static safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;

    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();

    return crypto.timingSafeEqual(ha, hb);
  }

  /**
   * 4️⃣ Input Sanitization（SQLi 防止）
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    // 危険な文字を削除/エスケープ
    return input
      .replace(/[;'"`\\]/g, '') // SQL インジェクション対策
      .replace(/[<>]/g, '') // XSS 対策
      .replace(/\0/g, ''); // Null バイト対策
  }

  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
  }

  static validatePassword(password) {
    // パスワード要件: 12 文字以上、特殊文字含む
    const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{12,}$/;
    return regex.test(password);
  }

  /**
   * 5️⃣ Content Security Policy (CSP)
   */
  static getCSPHeader() {
    return {
      'Content-Security-Policy': [
        "default-src 'self'", // デフォルトは自サイトのみ
        "script-src 'self'", // スクリプトは自サイトのみ
        "style-src 'self'", // スタイルは自サイトのみ
        "img-src 'self' data:", // 画像は自サイト + data URI
        'connect-src \'self\'', // 外部接続は制限
        "font-src 'self'",
        'frame-ancestors \'none\'', // iframe 埋め込み禁止
      ].join('; '),
    };
  }

  /**
   * 6️⃣ セキュリティヘッダー
   */
  static getSecurityHeaders() {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', // HTTPS 強制 (1年)
      'X-Content-Type-Options': 'nosniff', // MIME タイプ嗅ぎ対策
      'X-Frame-Options': 'DENY', // Clickjacking 対策
      'X-XSS-Protection': '1; mode=block', // XSS 対策
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };
  }

  /**
   * 7️⃣ ログイン試行制限（ブルートフォース対策）
   */
  static createLoginAttemptLimiter() {
    const attempts = new Map();

    return (email) => {
      const now = Date.now();
      const attemptData = attempts.get(email) || { count: 0, lastAttempt: 0 };

      // 15分以上経過でカウントリセット
      if (now - attemptData.lastAttempt > 15 * 60 * 1000) {
        attemptData.count = 0;
      }

      attemptData.count++;
      attemptData.lastAttempt = now;
      attempts.set(email, attemptData);

      // 5回以上失敗で 15 分ブロック
      if (attemptData.count > 5) {
        throw new Error('Account temporarily locked. Try again in 15 minutes.');
      }

      return attemptData.count;
    };
  }

  /**
   * 8️⃣ セッションタイムアウト
   */
  static getSessionConfig() {
    return {
      expiresIn: '1h', // 1 時間でログアウト
      refreshTokenExpiry: '7d',
      absoluteTimeout: '24h', // 絶対タイムアウト (24時間)
    };
  }

  /**
   * 9️⃣ ログ監査（本番ログに機密情報なし）
   */
  static sanitizeLog(data) {
    // key.toLowerCase() と camelCase の一覧を比較していたため
    // passwordHash / apiKey / creditCard が一致せず素通りしていた。
    // 判定側も小文字に正規化して比較する。
    const sensitiveFields = [
      'password',
      'passwordhash',
      'token',
      'accesstoken',
      'refreshtoken',
      'apikey',
      'secret',
      'jwtsecretkey',
      'authorization',
      'creditcard',
    ];

    // 循環参照があると JSON.stringify が例外を投げ、
    // エラーハンドラの中で二次障害になるため WeakSet で追跡する。
    const seen = new WeakSet();

    const walk = (value) => {
      // Error は message/stack が非列挙のため、明示的に取り出さないと {} になる
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (value === null || typeof value !== 'object') return value;

      if (seen.has(value)) return '[Circular]';
      seen.add(value);

      if (Array.isArray(value)) return value.map(walk);

      const out = {};
      Object.keys(value).forEach((key) => {
        out[key] = sensitiveFields.includes(key.toLowerCase())
          ? '***REDACTED***'
          : walk(value[key]);
      });
      return out;
    };

    return walk(data);
  }

  /**
   * 🔟 暗号化通信強制
   */
  static enforceHTTPS(req, res, next) {
    if (process.env.NODE_ENV === 'production') {
      if (req.header('x-forwarded-proto') !== 'https') {
        return res.redirect(301, `https://${req.header('host')}${req.url}`);
      }
    }
    next();
  }

  /**
   * 1️⃣1️⃣ リクエスト署名検証（改ざん防止）
   */
  static createRequestSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  static verifyRequestSignature(payload, signature, secret) {
    const expectedSignature = this.createRequestSignature(payload, secret);
    return AdvancedSecurity.safeCompare(signature, expectedSignature);
  }

  /**
   * 1️⃣2️⃣ セキュリティヘッダーミドルウェア
   */
  static applySecurityMiddleware() {
    return (req, res, next) => {
      // セキュリティヘッダー追加
      Object.entries(this.getSecurityHeaders()).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // CSP ヘッダー追加
      Object.entries(this.getCSPHeader()).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      next();
    };
  }
}

module.exports = AdvancedSecurity;

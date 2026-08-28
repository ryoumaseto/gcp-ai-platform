const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { generateToken } = require('../middleware/auth');
const AdvancedSecurity = require('../security/advancedSecurity');

// メールアドレス単位のログイン失敗追跡（5 回失敗で 15 分ロック）。
// IP ベースの rate limit だけでは、同一 IP から多数のアカウントを
// 総当たりする攻撃を抑えきれない。
// 失敗のみを数え、成功したらリセットする（正規ユーザーが締め出されないように）。
const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function isLockedOut(email) {
  const entry = loginFailures.get(email);
  if (!entry) return false;

  if (Date.now() - entry.lastFailure > LOCK_WINDOW_MS) {
    loginFailures.delete(email);
    return false;
  }

  return entry.count >= MAX_FAILURES;
}

function recordFailure(email) {
  const entry = loginFailures.get(email);
  const withinWindow = entry && Date.now() - entry.lastFailure <= LOCK_WINDOW_MS;

  loginFailures.set(email, {
    count: withinWindow ? entry.count + 1 : 1,
    lastFailure: Date.now(),
  });
}

function clearFailures(email) {
  loginFailures.delete(email);
}

// サインアップ
router.post('/signup', async (req, res) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name, password are required' });
    }

    // クライアント側の検証は迂回できるため、サーバー側でも必ず検証する
    if (!AdvancedSecurity.validateEmail(email)) {
      return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
    }

    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({ error: 'name は1〜100文字で指定してください' });
    }

    if (!AdvancedSecurity.validatePassword(password)) {
      return res.status(400).json({
        error: 'パスワードは12文字以上で、英字・数字・特殊文字 (@$!%*#?&) を含める必要があります',
      });
    }

    // ユーザー存在確認
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      name,
      passwordHash,
    });

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Error in signup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ログイン
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    if (isLockedOut(email)) {
      return res.status(429).json({
        error: 'ログイン試行が多すぎます。15分後に再度お試しください。',
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      recordFailure(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // パスワード検証
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      recordFailure(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    clearFailures(email);

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

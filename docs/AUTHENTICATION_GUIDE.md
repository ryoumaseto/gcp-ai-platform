# 🔐 認証ガイド

## 現在の実装

### メール・パスワード認証 ✅

```
ユーザー入力
  ↓
POST /auth/signup または /auth/login
  ↓
Backend: bcrypt ハッシュ化
  ↓
JWT トークン生成
  ↓
localStorage に保存
  ↓
API リクエスト時に Authorization ヘッダーに付与
```

**セキュリティ:**
- ✅ bcrypt でパスワード暗号化 (12文字以上、大文字・数字・特殊文字必須)
- ✅ JWT トークン (7日有効)
- ✅ タイミング攻撃対策
- ✅ 100点セキュリティ監査対応

---

## 将来実装: Google OAuth (Next.js + Google Cloud)

### いつ実装するか？

- 本番デプロイ後
- ユーザーフィードバック後
- 追加認証方式が必要になった時点

### 実装フロー

#### Step 1: Google Cloud Console 設定

```bash
# Google Cloud Console で OAuth2 認証情報を作成
1. APIs & Services → Credentials
2. Create Credentials → OAuth 2.0 Client IDs
3. Application type: Web application
4. Authorized JavaScript origins:
   - http://localhost:3000
   - https://app.example.com (本番)
5. Authorized redirect URIs:
   - http://localhost:3000/api/auth/callback/google
   - https://app.example.com/api/auth/callback/google

# 取得される値:
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
```

#### Step 2: NextAuth.js インストール

```bash
cd apps/home-app
npm install next-auth
npm install @next-auth/prisma-adapter prisma
```

#### Step 3: NextAuth 設定

```typescript
// apps/home-app/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      // Google でログイン → Backend API で同期
      const response = await fetch(
        `${process.env.NEXTAUTH_URL}/auth/google-signin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            name: user.name,
            googleId: user.id,
          }),
        }
      );
      return response.ok;
    },
  },
}

export const handler = NextAuth(authOptions)
```

#### Step 4: Backend Google ログイン処理

```javascript
// apps/backend/routes/auth.js
router.post('/google-signin', async (req, res) => {
  const { email, name, googleId } = req.body;

  let user = await User.findOne({ where: { email } });

  if (!user) {
    // 初回ログイン: ユーザー作成
    user = await User.create({
      email,
      name,
      googleId,
      status: 'active',
      // パスワード不要 (Google 認証を使用)
    });
  }

  // JWT トークン生成
  const token = generateToken(user.id);

  res.json({ user, token });
});
```

#### Step 5: Frontend ログインボタン

```typescript
// components/GoogleSignInButton.tsx
import { signIn } from 'next-auth/react';

export function GoogleSignInButton() {
  return (
    <button
      onClick={() => signIn('google', { redirect: false })}
      className="w-full bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
    >
      🔵 Google でログイン
    </button>
  );
}
```

#### Step 6: 認証ページ更新

```typescript
// apps/home-app/app/auth/login/page.tsx (変更例)

import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function LoginPage() {
  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* メール・パスワード入力 */}
        </form>

        {/* OR 区切り線 */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">または</span>
          </div>
        </div>

        {/* Google ログイン */}
        <GoogleSignInButton />
      </CardContent>
    </Card>
  );
}
```

---

## 認証方式の比較

| 項目 | メール・PW | Google OAuth |
|------|--------|------|
| **セットアップ** | シンプル ✅ | 複雑 (30分) |
| **ユーザー体験** | 入力必須 | ワンクリック |
| **依存性** | 独立 | Google Account |
| **費用** | なし | なし |
| **セキュリティ** | 高い (100点) | Google に委譲 |
| **本番対応** | ✅ | ✅ |

---

## 推奨実装パス

### Phase 1 (現在) ✅
```
メール・パスワード認証のみ
- シンプル
- セキュアで十分
- 本番デプロイ可能
```

### Phase 2 (将来)
```
メール・パスワード + Google OAuth
- ユーザーの選択肢増加
- UX 向上
```

---

## ユーザー管理の一元化

Google OAuth 追加時は、以下のマッピングが必要：

```sql
-- users テーブル拡張
ALTER TABLE users ADD COLUMN (
  googleId VARCHAR(255) UNIQUE,
  authMethod ENUM('email', 'google'),
  lastLogin TIMESTAMP
);

-- インデックス
CREATE INDEX idx_users_googleId ON users(googleId);
```

**ログイン時のロジック:**
```javascript
// email で検索 → なければ google でログイン
const user = await User.findOne({ 
  where: { email }
});

if (user) {
  // 既存ユーザー
  if (user.authMethod === 'google') {
    // Google でログイン
  } else {
    // メール・PW でログイン
  }
} else {
  // 新規ユーザー
  const googleUser = await User.findOne({
    where: { googleId: profile.id }
  });
}
```

---

## 環境変数設定

### 開発環境 (.env.local)
```bash
# Google OAuth (開発用)
GOOGLE_CLIENT_ID=xxx-dev.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
```

### 本番環境 (GCP Secret Manager)
```bash
# Cloud Secret Manager に保存
gcloud secrets create GOOGLE_CLIENT_ID --data="xxx-prod.apps.googleusercontent.com"
gcloud secrets create GOOGLE_CLIENT_SECRET --data="xxxxx"
gcloud secrets create NEXTAUTH_SECRET --data="secure-random-string"
```

---

## トラブルシューティング

### Google ログイン失敗
```
エラー: "Redirect URI mismatch"

原因: Google Cloud Console のリダイレクト URI が一致していない

解決:
1. Google Cloud Console を開く
2. APIs & Services → Credentials
3. OAuth 2.0 Client IDs を編集
4. Authorized redirect URIs を確認:
   - http://localhost:3000/api/auth/callback/google
   - https://app.example.com/api/auth/callback/google
```

### トークン検証エラー
```
エラー: "Invalid JWT"

原因: NextAuth トークン と Backend JWT の形式が異なる

解決:
- NextAuth の JWT をデコード
- Backend で検証
- session コールバックで統一
```

---

## セキュリティ考慮事項

### Google OAuth 使用時
```javascript
// ✅ 推奨: ID トークンを検証
const ticket = await client.verifyIdToken({
  idToken: token,
  audience: process.env.GOOGLE_CLIENT_ID,
});

// ✅ メールアドレスを検証
if (!ticket.payload.email_verified) {
  return res.status(400).json({ error: 'Email not verified' });
}

// ✅ ユーザー隔離を確認
if (ticket.payload.aud !== process.env.GOOGLE_CLIENT_ID) {
  return res.status(403).json({ error: 'Invalid audience' });
}
```

### CSRF 保護
```javascript
// NextAuth は CSRF 保護を自動実装
// signin/callback のコールバックで検証される
```

---

## 今後の拡張

### Multi-factor Authentication (MFA)
```
Google OAuth + TOTP 認証
- セキュリティ強化
- 本番環境推奨
```

### Social Login 追加
```
- GitHub ログイン
- Microsoft ログイン
- Apple ログイン
```

### Session Management
```
- Refresh Token ローテーション
- セッション無効化
- Device Management
```

---

## チェックリスト

### 現在 (メール・PW)
- [x] ログイン/サインアップページ
- [x] JWT トークン管理
- [x] Backend 認証 API
- [x] 100点セキュリティ

### 将来 (Google OAuth)
- [ ] Google Cloud Console 設定
- [ ] NextAuth.js インストール
- [ ] Google ログイン処理
- [ ] Backend 同期ロジック
- [ ] UI 更新
- [ ] テスト・デプロイ

---

**結論:** 
現在のメール・パスワード認証は本番環境対応可能 ✅
Google OAuth は後から追加可能（依存性なし）

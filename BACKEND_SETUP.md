# バックエンド API セットアップ手順書

## 📋 概要

フロントエンド（home-app）とバックエンドAPIを連携させるための手順書です。

## 🎯 実装目標

フロントエンドのフォームから、以下のAPIエンドポイントを呼び出せるようにします：

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/api/generate` | POST | アプリ生成ジョブを作成 |
| `/api/jobs/:id` | GET | ジョブの進捗を取得 |
| `/api/jobs/:id/approve-design` | POST | 設計書を承認 |
| `/api/jobs/:id/reject-design` | POST | 設計書を却下 |

## 🚀 クイックスタート

### 1. バックエンドプロジェクト作成

```bash
# プロジェクトルートから
mkdir -p apps/backend
cd apps/backend

# Python/FastAPI をセットアップ
python3 -m venv venv
source venv/bin/activate

# 依存パッケージをインストール
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv pydantic
```

### 2. 環境変数設定

`apps/backend/.env` を作成：

```env
# データベース接続
DATABASE_URL=postgresql://localhost/app_maker

# API ポート
PORT=3001
HOST=0.0.0.0

# JWT設定
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
```

### 3. データベース初期化

```bash
# PostgreSQL に app_maker DB を作成
psql -c "CREATE DATABASE app_maker;"

# スキーマ適用（doc/app-generator-saas-improved-v2.1.md から SQL をコピー）
psql -d app_maker < schema.sql
```

### 4. FastAPI サーバー起動

```bash
# apps/backend で
python -m uvicorn main:app --reload --port 3001
```

## 📡 API エンドポイント仕様

### POST /api/generate

**リクエスト**:
```json
{
  "description": "ブログ投稿管理システム",
  "appName": "MyBlog",
  "language": "TypeScript",
  "dbType": "PostgreSQL",
  "temperature": 0.7
}
```

**レスポンス**:
```json
{
  "id": "job-uuid",
  "status": "pending",
  "progress": 0,
  "appName": "MyBlog",
  "language": "TypeScript",
  "dbType": "PostgreSQL",
  "temperature": 0.7,
  "createdAt": "2026-08-27T12:00:00Z"
}
```

### GET /api/jobs/:id

**レスポンス**:
```json
{
  "id": "job-uuid",
  "status": "design_review",
  "progress": 30,
  "appName": "MyBlog",
  "designDocument": "...",
  "error": null,
  "createdAt": "2026-08-27T12:00:00Z",
  "updatedAt": "2026-08-27T12:05:00Z"
}
```

### POST /api/jobs/:id/approve-design

**レスポンス**:
```json
{
  "id": "job-uuid",
  "status": "approved",
  "progress": 40
}
```

## 🔄 データベーススキーマ

最小限のスキーマ：

```sql
CREATE TABLE app_generation_jobs (
  job_id UUID PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress INT DEFAULT 0,
  language VARCHAR(50),
  db_type VARCHAR(50),
  temperature FLOAT,
  design_document TEXT,
  app_url VARCHAR(255),
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## ✅ チェックリスト

- [ ] バックエンドディレクトリ作成
- [ ] 環境変数設定
- [ ] データベース初期化
- [ ] FastAPI サーバー実装
- [ ] POST /api/generate エンドポイント実装
- [ ] GET /api/jobs/:id エンドポイント実装
- [ ] ジョブ状態管理実装
- [ ] フロントエンドとの連携テスト

## 🧪 テスト

```bash
# サーバー起動後
# 1) サインアップしてトークンを取得
TOKEN=$(curl -s -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","name":"You","password":"StrongPass123!@#"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

# 2) ジョブ作成（全エンドポイントで JWT が必須）
curl -X POST http://localhost:3001/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "テストアプリ",
    "appName": "TestApp",
    "language": "TypeScript",
    "dbType": "PostgreSQL",
    "model": "gemini-2.0-flash"
  }'
```

## 📝 次のステップ

1. バックエンドサーバーを起動
2. フロントエンド `.env.local` でAPI URLを確認（http://localhost:3001）
3. フロントエンドで「アプリを生成」ボタンをクリック
4. ジョブが作成されるか確認

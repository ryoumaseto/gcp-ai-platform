# 🚀 AppGen システム クイックスタート

## ✅ システム構成

```
┌─────────────────────────────────────────────────┐
│             フロントエンド (Next.js)             │
│          http://localhost:3000                  │
│  ├─ Hero セクション                             │
│  ├─ フォーム入力（アプリ説明）                 │
│  ├─ 生成進捗表示                               │
│  └─ 設計書レビュー・承認                       │
└────────────────┬────────────────────────────────┘
                 │
              REST API
           (axios 使用)
                 │
┌────────────────▼────────────────────────────────┐
│            バックエンド (Express.js)            │
│          http://localhost:3001                  │
│  ├─ POST /api/generate                          │
│  ├─ GET /api/jobs/:id                           │
│  ├─ POST /api/jobs/:id/approve-design           │
│  └─ POST /api/jobs/:id/reject-design            │
└────────────────┬────────────────────────────────┘
                 │
            メモリストア
         (開発用・本番は DB)
                 │
        ┌────────▼─────────┐
        │  ジョブ進捗管理   │
        │ (2秒ごとに更新)  │
        └──────────────────┘
```

## 🟢 両サーバーが起動済み

✓ **フロントエンド**: http://localhost:3000 (Next.js)
✓ **バックエンド**: http://localhost:3001 (Express.js)

## 📊 システムの動き

### ステップ 1: ユーザーがフォームを入力
```
ブラウザで http://localhost:3000 を開く
  ↓
フォーム入力：
  - アプリの説明: "ブログ投稿管理システム"
  - アプリ名: "MyBlog"
  - 言語: "TypeScript"
  - DB: "PostgreSQL"
  - クリエイティビティ: 0.7
  ↓
「アプリを生成」ボタンをクリック
```

### ステップ 2: API呼び出し
```
フロントエンド → バックエンド
  ↓
POST /api/generate
  {
    "description": "ブログ投稿管理システム",
    "appName": "MyBlog",
    "language": "TypeScript",
    "dbType": "PostgreSQL",
    "temperature": 0.7
  }
  ↓
レスポンス：
  {
    "id": "uuid-xxx",
    "status": "pending",
    "progress": 0,
    "createdAt": "2026-08-27T..."
  }
```

### ステップ 3: リアルタイム進捗更新
```
フロントエンド → ポーリング（3秒間隔）
  ↓
GET /api/jobs/uuid-xxx
  ↓
進捗が自動更新：
  - pending (0%) → pending (10%)
  - design_review (30%) → 設計書を表示
  - approved (60%)
  - deployed (100%) → アプリ URL 表示
```

### ステップ 4: 設計書レビュー
```
design_review 状態になると：
  - 「設計書を表示」ボタンが有効化
  - 設計内容が表示される
  - 「承認」または「却下」を選択
  
承認：
  POST /api/jobs/uuid-xxx/approve-design
  → status が "approved" に進む
  
却下：
  POST /api/jobs/uuid-xxx/reject-design
  → status が "pending" にリセット
```

## 🧪 テスト方法

### コマンドラインでのテスト

```bash
# 1. ジョブ作成
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "description": "テストアプリ",
    "appName": "TestApp",
    "language": "TypeScript",
    "dbType": "PostgreSQL",
    "temperature": 0.7
  }'

# 応答例：
# {
#   "id": "8a1d4d79-f290-415c-8ba6-3ffcd5d79cfc",
#   "status": "pending",
#   "progress": 0,
#   ...
# }

# 2. 進捗確認（数回実行して進捗を見る）
curl http://localhost:3001/api/jobs/8a1d4d79-f290-415c-8ba6-3ffcd5d79cfc

# 3. 設計書承認
curl -X POST http://localhost:3001/api/jobs/8a1d4d79-f290-415c-8ba6-3ffcd5d79cfc/approve-design
```

### ブラウザでのテスト

1. **http://localhost:3000** にアクセス
2. フォームに以下を入力：
   - アプリの説明: "Todoリスト管理"
   - アプリ名: "TodoApp"
3. 「アプリを生成」をクリック
4. 進捗表示を確認
5. "設計レビュー" になったら「設計書を表示」をクリック
6. 「承認」をクリック
7. デプロイ完了まで待つ

## 📁 ファイル構成

```
gcp-ai-platform/
├── apps/
│   ├── home-app/                 # フロントエンド (Next.js)
│   │   ├── app/
│   │   │   ├── layout.tsx        # ルートレイアウト
│   │   │   ├── page.tsx          # ホームページ
│   │   │   └── globals.css       # Tailwind CSS
│   │   ├── components/
│   │   │   ├── PromptForm.tsx    # フォーム
│   │   │   ├── JobStatus.tsx     # 進捗表示
│   │   │   └── ui/               # Shadcn コンポーネント
│   │   ├── lib/
│   │   │   ├── store.ts          # Zustand ストア
│   │   │   └── api.ts            # API クライアント
│   │   └── .env.local            # 環境変数
│   │
│   └── backend/                  # バックエンド (Express.js)
│       ├── server.js             # メインサーバー
│       ├── package.json
│       └── .env                  # 環境変数
│
├── doc/                          # ドキュメント
│   └── app-generator-saas-improved-v2.1.md
│
└── infra/                        # GCP Terraform
    ├── main.tf
    └── modules/
```

## 🔧 データベース連携（本番向け）

現在はメモリストアを使用しているため、サーバー再起動でジョブが消失します。

本番環境では以下の手順で PostgreSQL を連携させます：

### 1. Cloud SQL インスタンス起動（Terraform）
```bash
cd infra
terraform init
terraform plan
terraform apply
```

### 2. バックエンドを DB 連携に更新
```bash
cd apps/backend

# SQLAlchemy + psycopg2 インストール
npm uninstall express (Node.js → Python に切り替える場合)

# または、Node.js で sequelize を使用
npm install sequelize pg
```

### 3. データベーススキーマ適用
```bash
psql -d app_maker < schema.sql
```

詳細は `/home/ryohma/gcp-ai-platform/BACKEND_SETUP.md` を参照

## 🚀 次のステップ

### Phase 1: ローカル開発完了 ✅
- [x] フロントエンド UI 完成
- [x] バックエンド API スケルトン
- [x] 両者の連携確認

### Phase 2: バックエンド実装（推奨）
- [ ] Cloud SQL 連携
- [ ] JWT 認証
- [ ] ジョブ永続化
- [ ] Pub/Sub ワークフロー

### Phase 3: AI 連携
- [ ] Claude / Gemini API 統合
- [ ] 実際のコード生成
- [ ] テスト・セキュリティスキャン

### Phase 4: デプロイ
- [ ] Cloud Run コンテナ化
- [ ] GCP リソース本番化
- [ ] ドメイン・DNS 設定

## 💡 トラブルシューティング

### ポート競合
```bash
# ポート 3000 を強制終了
kill $(lsof -t -i :3000)

# ポート 3001 を強制終了
kill $(lsof -t -i :3001)
```

### キャッシュクリア
```bash
# フロントエンド
cd apps/home-app
rm -rf .next node_modules
npm install

# バックエンド
cd apps/backend
npm cache clean --force
npm install
```

### ログ確認
```bash
# フロントエンドのみアクセス
cd apps/home-app
npm run dev

# バックエンドのみアクセス
cd apps/backend
npm run dev
```

## ✨ おめでとうございます！

フルスタック AppGen システムの基盤が完成しました！🎉

- ✅ フロントエンド: モダン UI (Next.js + Tailwind + Shadcn)
- ✅ バックエンド: REST API (Express.js)
- ✅ 連携: リアルタイムジョブ追跡
- ✅ UX: フォーム入力 → 進捗表示 → 完了通知

次は Cloud SQL 連携と AI 機能を実装して、本物のアプリ生成機能を実装します！

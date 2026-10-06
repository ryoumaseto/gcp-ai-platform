# gcp-ai-platform

自然言語でアプリの説明を書くと、Gemini が設計書とコードを生成し、承認後に **Cloud Run へ自動デプロイして動く URL を返す** AI アプリジェネレーターです。GCP 上での本番運用を前提に、インフラ（Terraform）まで含めています。

## 仕組み

```
ブラウザ (Next.js) ──REST──▶ バックエンド (Express)
                                │
                                ├─ Gemini でアプリの設計書を生成 → ユーザーが承認 / 却下
                                ├─ 承認後にコードを生成・パース
                                └─ tar.gz → GCS → Cloud Build でイメージ化 → Cloud Run にデプロイ
                                      └─ 動作確認し、失敗時は理由を添えて再生成
```

- **フロントエンド** (`apps/home-app`): Next.js / Tailwind / shadcn/ui。ログイン、プロンプト入力、ジョブ進捗、設計書レビュー。
- **バックエンド** (`apps/backend`): Express / Sequelize (PostgreSQL、ローカルは SQLite)。JWT 認証、レート制限、helmet。
- **Gemini 接続**: Vertex 方式（サービスアカウント認証、API キー不要・本番推奨）と AI Studio 方式（API キー）を切り替え可能。
- **インフラ** (`infra`): Cloud Run、Cloud SQL、VPC コネクタ、Secret Manager、カスタムドメイン。

### 生成アプリの隔離

生成されるのは AI が書いた任意のコードなので、次の方針で隔離しています（`apps/backend/services/deployService.js`）。

- 権限を持たない専用サービスアカウントで実行
- VPC コネクタを付けない（Cloud SQL や内部ネットワークに到達できない）
- リソース上限と最大インスタンス数を制限

## ローカルで動かす

必要なもの: Docker / Docker Compose

```bash
cp .env.example .env
# DB_PASSWORD と JWT_SECRET_KEY を埋める
#   openssl rand -base64 24   # DB_PASSWORD
#   openssl rand -base64 48   # JWT_SECRET_KEY
# Vertex 方式なら GCP_PROJECT_ID を設定し、事前に gcloud auth application-default login
# AI Studio 方式なら GEMINI_PROVIDER=aistudio と GEMINI_API_KEY を設定

docker compose up --build
```

- フロントエンド: http://localhost:3000
- バックエンド: http://localhost:3001

テスト:

```bash
cd apps/backend && npm install && npm test
```

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/auth/signup` / `/api/auth/login` | 登録 / ログイン |
| GET | `/api/jobs/models` | 利用可能なモデル一覧 |
| POST | `/api/jobs` | 生成ジョブの作成 |
| GET | `/api/jobs` / `/api/jobs/:jobId` | 一覧 / 詳細 |
| POST | `/api/jobs/:jobId/approve-design` | 設計書を承認 |
| POST | `/api/jobs/:jobId/reject-design` | 設計書を却下 |
| DELETE | `/api/jobs/:jobId` | ジョブ削除 |

## GCP へデプロイする

```bash
export GCP_PROJECT_ID=your-project-id
./deploy.sh
```

手順の詳細:

- [GCP_SETUP.md](GCP_SETUP.md): プロジェクトと State バケットの準備
- [infra/README.md](infra/README.md): Terraform の使い方（`terraform.tfvars.example` をコピーして編集）
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md): デプロイ全体の流れ
- [DOMAIN_SETUP.md](DOMAIN_SETUP.md): カスタムドメイン
- [AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md): 認証の仕様

`terraform.tfvars`、`.terraform/`、`*.tfstate` は Git に含めません（`.gitignore` 済み）。

## ディレクトリ構成

```
apps/backend    Express API、Gemini 連携、Cloud Run へのデプロイ処理
apps/home-app   Next.js フロントエンド
infra           Terraform（GCP 一式）
deploy.sh       ビルドからデプロイまでのスクリプト
docker-compose.yml  ローカル実行用
```

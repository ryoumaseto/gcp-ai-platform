# gcp-ai-platform

[![CI](https://github.com/ryoumaseto/gcp-ai-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/ryoumaseto/gcp-ai-platform/actions/workflows/ci.yml)

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

## 設計判断

- **AI の出力を信用しない。** 生成されるのは AI が書いた任意のコードなので、権限ゼロの専用サービスアカウント・VPC 接続なし・リソース上限と最大インスタンス数の制限付きの Cloud Run で動かします（`apps/backend/services/deployService.js`）。侵害されても Cloud SQL や内部ネットワーク、他のシークレットに届かないようにするためです。生成物のファイルパスは書き出し時に検証します（パス・トラバーサル対策）。
- **権限は最小に。** Secret Manager へのアクセス権は、プロジェクト全体ではなくシークレットごとに付与します。
- **API キーを持たない。** 本番の Gemini 呼び出しはサービスアカウント認証（Vertex 方式）です。キーのローテーションや漏えいを考えなくて済みます。
- **実環境で見つけた不具合を直す。** Gemini の一時的な失敗はリトライし、デプロイした生成アプリが実際に応答するかを検証して、失敗時は理由を渡して再生成します。コミット履歴に、実際の GCP で動かして見つけた不具合の修正が残っています。

## 運用上の注意

誰でも生成を実行できる状態で公開すると、Gemini と Cloud Build の料金が膨らみます。デモを公開する場合は、招待制にするか、1日の実行回数に上限を設けてください。

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

テスト（GitHub Actions でも `npm test`、フロントの型チェック、`terraform fmt` / `validate` を実行します）:

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

- [GCP_SETUP.md](docs/GCP_SETUP.md): プロジェクトと State バケットの準備
- [infra/README.md](infra/README.md): Terraform の使い方（`terraform.tfvars.example` をコピーして編集）
- [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md): デプロイ全体の流れ
- [DOMAIN_SETUP.md](docs/DOMAIN_SETUP.md): カスタムドメイン
- [AUTHENTICATION_GUIDE.md](docs/AUTHENTICATION_GUIDE.md): 認証の仕様

`terraform.tfvars`、`.terraform/`、`*.tfstate` は Git に含めません（`.gitignore` 済み）。

## ディレクトリ構成

```
apps/backend    Express API、Gemini 連携、Cloud Run へのデプロイ処理
apps/home-app   Next.js フロントエンド
infra           Terraform（GCP 一式）
deploy.sh       ビルドからデプロイまでのスクリプト
docker-compose.yml  ローカル実行用
```

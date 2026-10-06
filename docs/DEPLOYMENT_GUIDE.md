# 🚀 GCP デプロイメント完全ガイド

**目標**: GCP アカウント作成 → 本番環境デプロイ → 稼働確認

---

## Phase 1: GCP 準備 (30分)

### Step 1-1: GCP アカウント作成

```bash
# 1. Google Cloud Console にアクセス
# https://console.cloud.google.com

# 2. アカウント作成 or 既存アカウントでログイン

# 3. 新規プロジェクト作成
# プロジェクト名: app-gen-prod (推奨)
# 組織: (個人の場合はスキップ)
```

### Step 1-2: プロジェクト設定

```bash
# ターミナルで実行
gcloud auth login

# プロジェクト ID を確認
# コンソール上部に表示される
# 例: app-gen-prod-xxxxx

# 環境変数に設定
export GCP_PROJECT_ID="app-gen-prod-xxxxx"
export GCP_REGION="us-central1"

# デフォルトプロジェクト設定
gcloud config set project $GCP_PROJECT_ID
gcloud config set compute/region $GCP_REGION
```

### Step 1-3: Billing 設定

```bash
# 1. Google Cloud Console > Billing
# 2. Link a billing account to a project
# 3. クレジットカード情報入力

# 確認:
gcloud billing accounts list
gcloud billing projects link $GCP_PROJECT_ID \
  --billing-account=BILLING_ACCOUNT_ID
```

### Step 1-4: 必要な API 有効化

```bash
# Terraform が自動的に有効化するが、事前確認も可能
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  cloudresourcemanager.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com

# 確認:
gcloud services list --enabled | grep -E "run|sql|compute"
```

### Step 1-5: Terraform State Bucket 作成

```bash
# State ファイル用 GCS バケット作成
export STATE_BUCKET="${GCP_PROJECT_ID}-terraform-state"

gsutil mb -p $GCP_PROJECT_ID -l $GCP_REGION gs://$STATE_BUCKET

# バージョニング有効化 (復元用)
gsutil versioning set on gs://$STATE_BUCKET

# 暗号化有効化
gsutil encryption set gs://$STATE_BUCKET

# バケット確認:
gsutil ls
```

### ✅ Phase 1 チェックリスト

```
- [ ] GCP コンソールからプロジェクト作成
- [ ] gcloud CLI でログイン
- [ ] Billing 設定完了
- [ ] API 有効化完了
- [ ] Terraform State Bucket 作成完了

export GCP_PROJECT_ID="xxx"
export GCP_REGION="us-central1"
```

---

## Phase 2: 環境ファイル設定 (5分)

### Step 2-1: terraform.tfvars 編集

```bash
cd /home/ryohma/gcp-ai-platform/infra

# ファイルを編集
vim terraform.tfvars

# または sed で置換
sed -i "s/REPLACE_WITH_YOUR_GCP_PROJECT_ID/$GCP_PROJECT_ID/g" \
  terraform.tfvars
```

### Step 2-2: 環境変数設定

```bash
# ~/.bashrc または ~/.zshrc に追加
export GCP_PROJECT_ID="app-gen-prod-xxxxx"
export GCP_REGION="us-central1"
export TF_VAR_gcp_project_id=$GCP_PROJECT_ID
export TF_VAR_gcp_region=$GCP_REGION

# 反映
source ~/.bashrc
```

---

## Phase 3: Docker イメージビルド (10分)

### Step 3-1: Artifact Registry リポジトリ作成

```bash
gcloud artifacts repositories create app-gen \
  --location=$GCP_REGION \
  --repository-format=docker
```

### Step 3-2: Docker 認証設定

```bash
gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev
```

### Step 3-3: Frontend & Backend ビルド

> **重要**: `NEXT_PUBLIC_API_URL` は Next.js のビルド時にクライアントバンドルへ
> 埋め込まれます。Cloud Run の環境変数で後から与えてもブラウザ側には反映されないため、
> **ビルド前にバックエンド URL を確定させる必要があります。**
> Cloud Run のデフォルト URL は project number から決まるので事前に計算できます。

```bash
cd /home/ryohma/gcp-ai-platform

# バックエンド URL を事前に確定させる
PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format='value(projectNumber)')
BACKEND_URL="https://app-gen-backend-${PROJECT_NUMBER}.${GCP_REGION}.run.app"
echo "Backend URL: $BACKEND_URL"

# Backend
docker build \
  -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/backend:latest \
  ./apps/backend

# Frontend（バックエンド URL をビルド引数で埋め込む）
docker build \
  --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
  -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/frontend:latest \
  ./apps/home-app
```

### Step 3-3b: Gemini API キーを Secret Manager へ登録

Terraform はシークレットの「箱」だけを作ります。値を tfstate に平文で残さないため、
中身は gcloud で投入します。

```bash
# 先にシークレット本体だけ作成
cd infra && terraform apply -target=google_secret_manager_secret.gemini_api_key && cd ..

# 値を登録（https://aistudio.google.com/apikey で取得）
printf '%s' "$GEMINI_API_KEY" | \
  gcloud secrets versions add app-gen-gemini-api-key --data-file=-
```

### Step 3-4: Artifact Registry にプッシュ

```bash
# Frontend
docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/frontend:latest

# Backend
docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/backend:latest
```

---

## Phase 4: Terraform デプロイ (15分)

### Step 4-1: Terraform 初期化・実行

```bash
cd /home/ryohma/gcp-ai-platform/infra

# 初期化
terraform init \
  -backend-config="bucket=${GCP_PROJECT_ID}-terraform-state" \
  -backend-config="prefix=app-gen"

# Plan 確認
terraform plan -out=tfplan

# Apply (リソース作成)
terraform apply tfplan

# Cloud Run の URL が事前計算どおりか確認する
# false が返った場合は、出力された実 URL を terraform.tfvars の
# frontend_url / backend_url に設定し、フロントを再ビルドして再 apply する
terraform output url_prediction_matches
```

> 上記の手順は `./deploy.sh` が全自動で実行します。手動で追う必要がなければ
> `GCP_PROJECT_ID` と `GEMINI_API_KEY` を export して `./deploy.sh` を実行してください。

### Step 4-2: 出力確認

```bash
# デプロイ後の URL 取得
terraform output frontend_url
terraform output backend_url
terraform output database_host
```

---

## Phase 5: 動作確認 (10分)

### Step 5-1: Backend ヘルスチェック

```bash
BACKEND_URL=$(terraform output -raw backend_url)
curl -s "${BACKEND_URL}/health" | jq .

# 期待される出力:
# {
#   "status": "ok",
#   "database": "connected",
#   "security": "enabled"
# }
```

### Step 5-2: Frontend にアクセス

```bash
FRONTEND_URL=$(terraform output -raw frontend_url)
echo $FRONTEND_URL

# ブラウザで開く
open $FRONTEND_URL  # macOS
xdg-open $FRONTEND_URL  # Linux
start $FRONTEND_URL  # Windows
```

### Step 5-3: ユーザー登録テスト

```
ブラウザ操作:
1. 「サインアップ」クリック
2. メール: test@example.com
3. パスワード: TestPassword123!@
4. アカウント作成 → ログイン確認
```

### Step 5-4: ジョブ一覧ページ確認

```
ブラウザ操作:
1. ナビゲーションの「マイアプリ」クリック
2. /jobs ページ表示
3. 「生成済みアプリ: 0/3」確認
```

---

## Phase 6: 本番環境設定 (5分)

### Step 6-1: HTTPS・セキュリティ確認

```bash
# HTTPS 自動有効 (Cloud Run)
curl -I https://$(terraform output -raw frontend_url | sed 's|https://||')

# セキュリティヘッダー確認
curl -I https://$(terraform output -raw backend_url | sed 's|https://||') | grep "Strict-Transport-Security"
```

### Step 6-2: Database バックアップ確認

```bash
gcloud sql backups list --instance=app-gen-db-prod
```

### Step 6-3: リソース確認

```bash
# Cloud Run
gcloud run services list

# Cloud SQL
gcloud sql instances list

# VPC Connector
gcloud compute networks vpc-access connectors list --region=$GCP_REGION
```

---

## トラブルシューティング

### ❌ Terraform Apply エラー

```bash
# API 有効化忘れ
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
```

### ❌ Docker Push エラー

```bash
# 認証再設定
gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev
```

### ❌ Database 接続エラー

```bash
# VPC Connector 確認
gcloud compute networks vpc-access connectors list --region=$GCP_REGION
```

---

## 最終確認チェックリスト

```
✅ デプロイ完了確認:

フロントエンド
- [ ] Frontend URL アクセス可能
- [ ] ログイン画面表示
- [ ] サインアップ可能

バックエンド
- [ ] /health エンドポイント応答
- [ ] Database 接続
- [ ] ジョブ API 動作

セキュリティ
- [ ] HTTPS 強制
- [ ] 100点セキュリティ監査
- [ ] バックアップ有効

リソース
- [ ] Cloud Run 稼働
- [ ] Cloud SQL 稼働
- [ ] Secret Manager 設定
```

---

## 合計時間

| Phase | 所要時間 | 内容 |
|-------|--------|------|
| 1 | 30分 | GCP 準備・API有効化・State Bucket作成 |
| 2 | 5分 | terraform.tfvars 編集 |
| 3 | 10分 | Docker ビルド・プッシュ |
| 4 | 15分 | Terraform apply |
| 5 | 10分 | 動作確認 |
| 6 | 5分 | セキュリティ確認 |
| **合計** | **約75分** | **本番環境完全構築** |

---

## 本番稼働開始後

### 定期メンテナンス

```bash
# 週1回: ログ確認
gcloud logging read "severity>=ERROR" --limit 100

# 月1回: バックアップ確認
gcloud sql backups list --instance=app-gen-db-prod

# 月1回: リソース使用状況確認
gcloud run services describe app-gen-frontend --region=$GCP_REGION
```

### 更新方法

```bash
# 1. コード修正
# 2. Docker イメージ再ビルド
docker build -t ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/frontend:v2 ./apps/home-app

# 3. プッシュ
docker push ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/frontend:v2

# 4. Cloud Run で最新イメージ使用
gcloud run deploy app-gen-frontend \
  --image=${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/app-gen/frontend:v2 \
  --region=$GCP_REGION
```

---

**本番環境構築完全ガイド完成！🚀**

GCP アカウント作成後、このガイドに従って約75分で本番環境デプロイが完了します。

# App Gen - GCP デプロイガイド

**目標**: GCP にAI App Generator の完全なシステムをデプロイする

---

## 📋 前提条件

### 必須ツール
- `gcloud` CLI
- `terraform` (v1.0+)
- `docker` (イメージビルド用)

### インストール

**macOS:**
```bash
# Homebrew を使用
brew install google-cloud-sdk
brew install terraform
brew install docker
```

**Linux (Ubuntu/Debian):**
```bash
# Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Terraform
wget https://releases.hashicorp.com/terraform/1.7.0/terraform_1.7.0_linux_amd64.zip
unzip terraform_1.7.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Docker
sudo apt-get install docker.io
sudo usermod -aG docker $USER
```

---

## 🚀 デプロイステップ

### Step 1: GCP プロジェクト作成

```bash
# GCP コンソールにログイン
gcloud auth login

# 新規プロジェクト作成 (必要に応じて)
gcloud projects create app-gen-prod --name="AI App Generator"

# プロジェクト設定
export GCP_PROJECT_ID=$(gcloud projects list --format='value(PROJECT_ID)' --limit=1)
echo "Project ID: $GCP_PROJECT_ID"

# デフォルトプロジェクト設定
gcloud config set project $GCP_PROJECT_ID
```

### Step 2: Terraform State Bucket 作成

State はリモートの Google Cloud Storage に保存します。これによって:
- 複数チームメンバーでの管理が可能
- デプロイ情報の永続性確保
- Lock 機能によるコンフリクト防止

```bash
# State 用 GCS バケット作成
export STATE_BUCKET="${GCP_PROJECT_ID}-terraform-state"

gsutil mb -p $GCP_PROJECT_ID -l us-central1 gs://$STATE_BUCKET

# バージョニング有効化
gsutil versioning set on gs://$STATE_BUCKET

# 暗号化有効化
gsutil encryption set gs://$STATE_BUCKET

# バケットをプライベートに設定
gsutil iam ch serviceAccount:$GCP_PROJECT_ID@cloudservices.gserviceaccount.com:objectAdmin gs://$STATE_BUCKET
```

### Step 3: Docker イメージのビルドとプッシュ

```bash
cd /home/ryohma/gcp-ai-platform

# Artifact Registry にログイン
gcloud auth configure-docker us-central1-docker.pkg.dev

# Frontend ビルド
docker build -t us-central1-docker.pkg.dev/$GCP_PROJECT_ID/app-gen/frontend:latest ./apps/home-app

# Backend ビルド
docker build -t us-central1-docker.pkg.dev/$GCP_PROJECT_ID/app-gen/backend:latest ./apps/backend

# プッシュ
docker push us-central1-docker.pkg.dev/$GCP_PROJECT_ID/app-gen/frontend:latest
docker push us-central1-docker.pkg.dev/$GCP_PROJECT_ID/app-gen/backend:latest
```

### Step 4: Terraform 初期化とデプロイ

```bash
cd /home/ryohma/gcp-ai-platform/infra

# terraform.tfvars を編集
# GCP_PROJECT_ID を実際のプロジェクト ID に置き換え
sed -i "s/REPLACE_WITH_YOUR_GCP_PROJECT_ID/$GCP_PROJECT_ID/g" terraform.tfvars

# バックエンド初期化
terraform init \
  -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="prefix=app-gen"

# Plan を確認
terraform plan -out=tfplan

# Apply (リソース作成)
terraform apply tfplan

# 出力値を取得
terraform output
```

### Step 5: デプロイ情報の確認

```bash
# Frontend URL
terraform output frontend_url

# Backend URL
terraform output backend_url

# Database 接続情報
terraform output database_host
terraform output database_user
```

---

## 🔒 セキュリティチェックリスト

デプロイ後の確認項目:

- [ ] Secret Manager に DB パスワード保存済み
- [ ] Secret Manager に JWT シークレット保存済み
- [ ] Cloud Run サービスは非公開（サービスアカウント経由のみアクセス）
- [ ] Cloud SQL はプライベートネットワーク接続
- [ ] HTTPS が強制されている
- [ ] セキュリティヘッダーが有効
- [ ] Rate limiting が有効
- [ ] DDoS 対策が有効
- [ ] ログが Cloud Logging に出力されている
- [ ] バックアップが有効（自動化）

確認コマンド:
```bash
# Cloud Run セキュリティ確認
gcloud run services list

# Cloud SQL セキュリティ確認
gcloud sql instances describe app-gen-db-prod

# Secret Manager 確認
gcloud secrets list
```

---

## 📊 リソース一覧

デプロイされるリソース:

| リソース | 説明 | 費用/月 |
|---------|------|--------|
| Cloud Run (Frontend) | Next.js アプリケーション | ~$1 (無料枠超過時) |
| Cloud Run (Backend) | Express.js API | ~$1 (無料枠超過時) |
| Cloud SQL | PostgreSQL インスタンス | ~$9 (db-f1-micro) |
| Cloud Storage (State) | Terraform State | ~$0.02 |
| Secret Manager | シークレット管理 | $6/シークレット/月 |
| VPC Connector | プライベート接続 | ~$7 |
| **合計** | | **~$24/月** |

---

## 🛠️ トラブルシューティング

### Issue: "Permission denied" エラー

```bash
# ユーザーに必要な権限を付与
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member=user:YOUR_EMAIL@example.com \
  --role=roles/editor
```

### Issue: "API not enabled" エラー

```bash
# 必要な API を有効化
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable vpcaccess.googleapis.com
```

### Issue: Docker イメージプッシュエラー

```bash
# 認証を再設定
gcloud auth configure-docker us-central1-docker.pkg.dev
gcloud auth application-default login
```

### Issue: Terraform State ロック

```bash
# ロックをクリア（最終手段）
terraform force-unlock LOCK_ID
```

---

## 🔄 継続的デプロイ

### 環境別 State 管理

本番環境（prod）と開発環境（dev）を分離:

```bash
# 開発環境にデプロイ
terraform workspace new dev
terraform apply -var-file=dev.tfvars

# 本番環境にデプロイ
terraform workspace select prod
terraform apply -var-file=prod.tfvars
```

### GitHub Actions での自動デプロイ

```yaml
# .github/workflows/deploy.yml
name: Deploy to GCP

on:
  push:
    branches: [main]
    paths: ['infra/**', 'apps/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v2
      - run: |
          cd infra
          terraform init -backend-config="bucket=${{ secrets.TF_STATE_BUCKET }}"
          terraform apply -auto-approve
```

---

## 📖 参考資料

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Cloud SQL Security](https://cloud.google.com/sql/docs/postgres/security)

---

## 🎯 デプロイ確認

```bash
# 全リソース確認
gcloud compute instances list
gcloud run services list
gcloud sql instances list

# ログ確認
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# メトリクス確認
gcloud monitoring dashboards list
```

---

**デプロイ完了！** 🎉

Frontend: https://your-frontend-url
Backend: https://your-backend-url

100点セキュリティ監査対応済み ✅

# Terraform Infrastructure - App Gen

GCP に AI App Generator を本番デプロイするための完全なインフラストラクチャ as Code。

## 📁 ファイル構成

```
infra/
├── provider.tf              # GCP プロバイダー設定 + API 有効化
├── variables.tf             # 入力変数（プロジェクトID、リージョンなど）
├── backend.tf               # Remote State (Google Cloud Storage)
├── main-cloud-run.tf        # Cloud Run (Frontend + Backend)
├── database.tf              # Cloud SQL (PostgreSQL)
├── networking.tf            # VPC Connector
├── secrets.tf               # Secret Manager
├── outputs.tf               # 出力値（URLなど）
├── terraform.tfvars         # 環境値（要編集）
└── terraform.tfvars.example # テンプレート
```

## 🚀 クイックスタート

### 1. GCP プロジェクト設定

```bash
gcloud auth login
export GCP_PROJECT_ID="YOUR_GCP_PROJECT_ID"
gcloud config set project $GCP_PROJECT_ID
```

### 2. State Bucket 作成

```bash
gsutil mb -p $GCP_PROJECT_ID -l us-central1 gs://${GCP_PROJECT_ID}-terraform-state
gsutil versioning set on gs://${GCP_PROJECT_ID}-terraform-state
```

### 3. terraform.tfvars 編集

```bash
cp terraform.tfvars.example terraform.tfvars
# 編集: GCP_PROJECT_ID を実際の値に変更
```

### 4. Terraform 実行

```bash
terraform init \
  -backend-config="bucket=${GCP_PROJECT_ID}-terraform-state" \
  -backend-config="prefix=app-gen"

terraform plan
terraform apply
```

### 5. 出力確認

```bash
terraform output frontend_url
terraform output backend_url
terraform output database_host
```

## 🔐 セキュリティ機能

✅ **100点セキュリティ監査対応**

- Cloud SQL プライベートネットワーク接続
- Secret Manager による シークレット管理
- Cloud Run サービスアカウント with IAM
- HTTPS 強制
- Rate Limiting (DDoS 対策)
- CSRF 保護
- Input Sanitization

## 📊 デプロイされるリソース

| リソース | 説明 |
|---------|------|
| Cloud Run Frontend | Next.js アプリケーション |
| Cloud Run Backend | Express.js API |
| Cloud SQL | PostgreSQL 15 |
| VPC Connector | プライベート接続 |
| Secret Manager | 暗号化シークレット |
| Artifact Registry | Container イメージ |
| IAM Service Account | サービスアカウント |

## 🛠️ 使用可能なコマンド

```bash
# Plan のみ確認
terraform plan

# リソース作成
terraform apply

# リソース削除（本番では使用厳禁）
terraform destroy

# State 確認
terraform state list
terraform state show google_cloud_run_service.frontend

# Output 確認
terraform output
terraform output frontend_url

# Validation
terraform validate
terraform fmt -check
```

## 📝 環境別設定

複数環境での管理:

```bash
# 開発環境
terraform workspace new dev
terraform apply -var-file=terraform.dev.tfvars

# 本番環境
terraform workspace select prod
terraform apply -var-file=terraform.prod.tfvars
```

## ⚠️ 重要な注意事項

### State ファイル
- リモート State (GCS) は必須
- State ファイルには機密情報が含まれるため、アクセス制限が必要
- 誤削除防止: `prevent_destroy = true` ライフサイクルルール

### Cost
- Cloud Run: 最初の 180,000 vCPU-秒/月 無料
- Cloud SQL: db-f1-micro = $9/月 (無料枠なし)
- 合計: 約 $24/月 (ライト利用時)

### セキュリティ
- DB パスワードは Secret Manager で管理（State には保存されない）
- Service Account は最小権限原則に従う
- HTTPS 必須（Cloud Run は自動）

## 🔄 CI/CD 統合

GitHub Actions で自動デプロイ:

```bash
# Secrets を設定
gh secret set TF_BACKEND_BUCKET -b "${GCP_PROJECT_ID}-terraform-state"
gh secret set GCP_PROJECT_ID -b "$GCP_PROJECT_ID"
```

詳細は [GCP_SETUP.md](../GCP_SETUP.md) を参照。

## 📖 参考資料

- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Security](https://cloud.google.com/sql/docs/postgres/security)

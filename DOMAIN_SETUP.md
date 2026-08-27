# 🌐 ドメイン設定ガイド

## 現在のセットアップ

### デフォルト URL (カスタムドメインなし)
```
Frontend: https://app-gen-frontend-abc123xyz.run.app
Backend:  https://app-gen-backend-xyz789abc.run.app
```

**メリット:**
- SSL/TLS 自動対応
- セットアップ不要
- すぐに使用可能

**デメリット:**
- URL が長い
- ブランディングできない
- デプロイするたびに URL が変わる可能性

---

## 🎯 カスタムドメイン追加

### 必要な準備

1. **ドメイン購入**
   - Google Domains (推奨)
   - お名前.com
   - GoDaddy など

2. **例:**
   ```
   HOMEアプリ: app-generator.example.com
   Backend API: api.example.com
   ```

---

## 📝 カスタムドメイン設定手順

### Step 1: terraform.tfvars にドメイン追加

```hcl
# infra/terraform.tfvars
gcp_project_id  = "your-project-id"
gcp_region      = "us-central1"

# ===== カスタムドメイン =====
frontend_domain = "app.example.com"      # HOMEアプリ用
backend_domain  = "api.example.com"      # API用
```

### Step 2: Terraform Apply

```bash
cd infra
terraform apply
```

**出力例:**
```
Outputs:

frontend_dns_records = {
  "cname_target" = "ghs.googleusercontent.com"
  "domain" = "app.example.com"
  "type" = "CNAME"
}

backend_dns_records = {
  "cname_target" = "ghs.googleusercontent.com"
  "domain" = "api.example.com"
  "type" = "CNAME"
}
```

### Step 3: DNS レコード追加

**ドメインレジストラ (Google Domains など) の管理画面:**

#### Frontend (HOMEアプリ)
```
ホスト名: app.example.com
タイプ:   CNAME
値:      ghs.googleusercontent.com
TTL:     3600
```

#### Backend (API)
```
ホスト名: api.example.com
タイプ:   CNAME
値:      ghs.googleusercontent.com
TTL:     3600
```

### Step 4: DNS 伝播を待つ (5-48時間)

```bash
# DNS 確認コマンド
nslookup app.example.com
nslookup api.example.com

# 出力例:
# Non-authoritative answer:
# app.example.com canonical name = ghs.googleusercontent.com
```

### Step 5: SSL/TLS 証明書確認

Google Cloud は自動的に SSL 証明書を発行します ✅

```bash
# Cloud Run のドメイン確認
gcloud run domain-mappings list
```

---

## 🔧 環境別ドメイン設定

### 開発環境 (Dev)
```hcl
# infra/terraform.dev.tfvars
frontend_domain = ""  # デフォルト URL 使用
backend_domain  = ""  # デフォルト URL 使用
```

### 本番環境 (Prod)
```hcl
# infra/terraform.prod.tfvars
frontend_domain = "app.example.com"
backend_domain  = "api.example.com"
```

### デプロイ
```bash
# 開発環境
terraform apply -var-file=terraform.dev.tfvars

# 本番環境
terraform apply -var-file=terraform.prod.tfvars
```

---

## 📊 HOMEアプリのドメイン戦略

現在のセットアップでは、**HOMEアプリ = Frontend (Cloud Run)** です

```
ユーザーフロー:
┌──────────────────────────────┐
│ app.example.com に アクセス  │
│ (HOMEアプリ = Next.js)       │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ プロンプト入力フォーム       │
│ (Backend API と通信)        │
│ api.example.com/api/generate │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ 生成されたアプリURL          │
│ (Cloud Run 別インスタンス)   │
└──────────────────────────────┘
```

**推奨設定:**
```
app.example.com   → Frontend (HOMEアプリ)
api.example.com   → Backend (API)
```

---

## 🚀 ドメイン設定なしでも使用可能

### デフォルトドメイン (即座に使用可)
```bash
# デプロイ後
terraform output frontend_url
terraform output backend_url

# 例:
# https://app-gen-frontend-9abcd1234.run.app
# https://app-gen-backend-xyzabc9876.run.app
```

**このまま使用する場合:**
- カスタムドメイン設定スキップ
- デプロイ直後から即座に利用可能
- SSL/TLS は自動対応
- API_URL 環境変数は自動設定

---

## 🔐 セキュリティ考慮事項

### HTTPS (自動対応)
✅ Cloud Run は全トラフィック HTTPS 必須
✅ SSL/TLS 証明書は自動発行・更新

### CORS (クロスオリジン)
現在の設定:
```javascript
CORS 許可元: FRONTEND_URL (環境変数)
```

カスタムドメイン使用時の自動更新:
```
terraform apply
  ↓
FRONTEND_URL = https://app.example.com (自動更新)
  ↓
Backend CORS 設定が自動反映
```

### DNS Hijacking 防止
```bash
# DNSSEC 有効化 (Google Domains)
1. Google Domains コンソール
2. DNS タブ
3. DNSSEC セクション
4. "DNSSEC を有効にする" をクリック
```

---

## 🆚 ドメイン設定の比較

| 項目 | デフォルト URL | カスタムドメイン |
|------|--------|-------|
| **セットアップ** | 不要 | DNS 設定必須 |
| **URL** | 長い | ブランディング可能 |
| **SSL/TLS** | 自動 | 自動 |
| **費用** | 無料 | ドメイン料金 |
| **プロダクション対応** | △ | ✅ |

---

## ⚡ 素早い確認方法

### 1. デフォルト URL で即座にテスト

```bash
# GCP コンソール
gcloud run services list

# 例:
# https://app-gen-frontend-xyz123.run.app
# https://app-gen-backend-abc456.run.app
```

### 2. 後からカスタムドメイン追加

```bash
# terraform.tfvars 編集
frontend_domain = "app.example.com"
backend_domain  = "api.example.com"

# 再デプロイ
terraform apply
```

---

## 📞 トラブルシューティング

### DNS が反映されない

```bash
# キャッシュクリア + 再確認
nslookup -type=CNAME app.example.com 8.8.8.8

# Google Public DNS で確認
dig @8.8.8.8 app.example.com
```

### SSL 証明書エラー

```bash
# Cloud Run のドメインマッピング確認
gcloud run domain-mappings describe app.example.com

# 証明書の状態を確認
gcloud run domain-mappings describe app.example.com \
  --format="value(status.resourceRecords)"
```

### CORS エラー

現在のバックエンド設定:
```javascript
// server-secure.js
cors({
  origin: process.env.FRONTEND_URL,  // 自動設定
  credentials: true,
})
```

カスタムドメイン使用時:
- Terraform の environment variable が自動更新
- 再デプロイ不要 (Terraform apply のみ)

---

## 🎯 推奨構成

### 小規模 (テスト用)
```
デフォルト URL のみ使用
- セットアップ簡単
- 即座に動作確認可能
- SSL 自動対応
```

### 本番環境
```
カスタムドメイン + Google Domains
- app.example.com (Frontend/HOMEアプリ)
- api.example.com (Backend/API)
- 年間 ~$12 (ドメイン料金)
- ブランディング可能
- プロフェッショナル
```

---

## 📋 チェックリスト

### デフォルト URL で使用
- [ ] GCP プロジェクト作成完了
- [ ] Terraform apply 実行
- [ ] Frontend URL を browser で確認
- [ ] Backend health check (`/health`) で確認
- [ ] PromptForm でテスト送信

### カスタムドメイン追加
- [ ] ドメイン購入完了
- [ ] terraform.tfvars にドメイン記入
- [ ] `terraform apply`
- [ ] DNS レコード追加 (ドメインレジストラ)
- [ ] DNS 伝播を待つ (5-48時間)
- [ ] `nslookup` で DNS 確認
- [ ] ブラウザでカスタムドメインでアクセス

---

**結論:** 
- GCP アカウント作成後、**デフォルト URL (カスタムドメイン不要) で即座に使用可能** ✅
- 後からカスタムドメイン追加も簡単（Terraform + DNS設定のみ）

#!/bin/bash

set -euo pipefail

echo "╔════════════════════════════════════════════════════════╗"
echo "║          App Gen - GCP デプロイスクリプト              ║"
echo "╚════════════════════════════════════════════════════════╝"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
REPO_NAME="app-gen"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"

# ===== 前提条件の確認 =====
echo -e "\n${YELLOW}Step 0: 前提条件を確認しています...${NC}"

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}GCP_PROJECT_ID が設定されていません${NC}"
  echo "  export GCP_PROJECT_ID=your-project-id"
  exit 1
fi

for cmd in gcloud docker terraform; do
  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${RED}$cmd が見つかりません${NC}"
    exit 1
  fi
done

# Gemini の接続先。既定は Vertex AI（サービスアカウント認証）で、
# この場合 API キーは一切不要。
# grep が該当なしで終了コード 1 を返すと set -e でスクリプトが止まるため、
# 未設定を正常系として扱う（|| true）。
GEMINI_PROVIDER=$( { grep -E '^\s*gemini_provider\s*=' infra/terraform.tfvars 2>/dev/null \
  | sed -E 's/.*=\s*"([^"]*)".*/\1/' | head -1; } || true )
GEMINI_PROVIDER="${GEMINI_PROVIDER:-vertex}"

if [ "$GEMINI_PROVIDER" = "aistudio" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
  echo -e "${RED}GEMINI_API_KEY が設定されていません（gemini_provider=aistudio のため）${NC}"
  echo "  export GEMINI_API_KEY=your-key"
  exit 1
fi

echo "  Gemini 接続先: ${GEMINI_PROVIDER}"
if [ "$GEMINI_PROVIDER" = "vertex" ]; then
  echo "  （API キー不要 — サービスアカウント認証を使用）"
fi

echo -e "${GREEN}前提条件 OK${NC}"

cd "$(dirname "$0")"

export TF_VAR_gcp_project_id="$PROJECT_ID"
export TF_VAR_gcp_region="$REGION"

# ===== Step 1: Terraform ステートバケットと初期化 =====
# backend "gcs" は bucket の指定が必須。未指定だと init が失敗する。
STATE_BUCKET="${TF_STATE_BUCKET:-${PROJECT_ID}-terraform-state}"

echo -e "\n${YELLOW}Step 1: Terraform ステートバケットを準備しています...${NC}"

if ! gcloud storage buckets describe "gs://${STATE_BUCKET}" --project="$PROJECT_ID" &> /dev/null; then
  echo "  gs://${STATE_BUCKET} を作成します"
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access
  # ステートの誤削除・破損に備えてバージョニングを有効化する
  gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning
else
  echo "  gs://${STATE_BUCKET} は既に存在します"
fi

cd infra
terraform init -input=false -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=app-gen"
cd ..

echo -e "${GREEN}Terraform 初期化完了${NC}"

# ===== Step 2: API と Artifact Registry を先に作る =====
# Cloud Run はイメージが無いと作成できず、イメージは Artifact Registry が無いと
# push できないため、レジストリと API だけを先行して apply する。
echo -e "\n${YELLOW}Step 2: API 有効化と Artifact Registry を作成しています...${NC}"

cd infra
terraform apply -input=false -auto-approve \
  -target=google_project_service.required_apis \
  -target=google_artifact_registry_repository.app_gen
cd ..

echo -e "${GREEN}Artifact Registry 準備完了${NC}"

# ===== Step 3: Gemini API キーを Secret Manager へ投入 =====
# vertex の場合はキー自体が不要なので丸ごとスキップする。
if [ "$GEMINI_PROVIDER" = "aistudio" ]; then
  echo -e "\n${YELLOW}Step 3: Gemini API キーを Secret Manager に登録しています...${NC}"

  cd infra
  terraform apply -input=false -auto-approve \
    -target=google_secret_manager_secret.gemini_api_key
  cd ..

  # 値を tfstate に平文で残さないため、Terraform ではなく gcloud で投入する。
  printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add app-gen-gemini-api-key \
    --project="$PROJECT_ID" --data-file=- > /dev/null

  echo -e "${GREEN}シークレット登録完了${NC}"
else
  echo -e "\n${YELLOW}Step 3: Vertex AI 使用のため API キーの登録は不要です${NC}"
fi

# ===== Step 4: バックエンド URL を確定してイメージをビルド =====
# NEXT_PUBLIC_* はビルド時にクライアントバンドルへ埋め込まれるため、
# フロントのビルド前にバックエンド URL が確定している必要がある。
# Cloud Run のデフォルト URL は project number から決まるので事前に計算できる。
# カスタムドメインが tfvars にあればそちらを優先する。
# 同上。ドメイン未設定（コメントアウト）が既定なので必ず該当なしになる。
BACKEND_DOMAIN=$( { grep -E '^\s*backend_domain\s*=' infra/terraform.tfvars 2>/dev/null \
  | sed -E 's/.*=\s*"([^"]*)".*/\1/' | head -1; } || true )

# 優先順位:
#   1. terraform output frontend_build_api_url
#      （既に apply 済みなら、実 URL やカスタムドメインが反映された正しい値）
#   2. tfvars の backend_domain
#   3. project number からの予測（初回 apply 前のフォールバック）
# 2 番目までを飛ばして 3 に落ちると、URL 形式が予測と違うプロジェクトで
# 誤った URL をバンドルに焼き込んでしまう。
BACKEND_URL=$( { cd infra && terraform output -raw frontend_build_api_url 2>/dev/null; cd ..; } || true )

if [ -n "$BACKEND_URL" ]; then
  echo "  Terraform の出力から取得しました"
elif [ -n "$BACKEND_DOMAIN" ]; then
  BACKEND_URL="https://${BACKEND_DOMAIN}"
  echo "  カスタムドメインを使用します"
else
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  BACKEND_URL="https://app-gen-backend-${PROJECT_NUMBER}.${REGION}.run.app"
  echo "  project number から予測しました（初回 apply 前）"
fi

echo -e "\n${YELLOW}Step 4: Docker イメージをビルドしています...${NC}"
echo "  Backend URL (フロントに埋め込む): ${BACKEND_URL}"

# ビルドごとに一意なタグを付ける。:latest だけだと Terraform に差分が出ず、
# 新しいイメージを push しても Cloud Run が古いリビジョンを配信し続ける。
IMAGE_TAG="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
export TF_VAR_image_tag="$IMAGE_TAG"
echo "  イメージタグ: ${IMAGE_TAG}"

docker build \
  -t "${REGISTRY}/backend:${IMAGE_TAG}" \
  -t "${REGISTRY}/backend:latest" \
  ./apps/backend
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${BACKEND_URL}" \
  -t "${REGISTRY}/frontend:${IMAGE_TAG}" \
  -t "${REGISTRY}/frontend:latest" \
  ./apps/home-app

echo -e "${GREEN}ビルド完了${NC}"

# ===== Step 5: イメージを push =====
echo -e "\n${YELLOW}Step 5: イメージを Artifact Registry に push しています...${NC}"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker push "${REGISTRY}/backend:${IMAGE_TAG}"
docker push "${REGISTRY}/frontend:${IMAGE_TAG}"
docker push "${REGISTRY}/backend:latest"
docker push "${REGISTRY}/frontend:latest"

echo -e "${GREEN}push 完了${NC}"

# ===== Step 6: インフラ全体を apply =====
echo -e "\n${YELLOW}Step 6: Terraform で全体をデプロイしています...${NC}"

cd infra
terraform apply -input=false -auto-approve
cd ..

echo -e "${GREEN}インフラのデプロイ完了${NC}"

# ===== Step 7: 結果の確認 =====
echo -e "\n${YELLOW}Step 7: デプロイ結果を確認しています...${NC}"

cd infra
ACTUAL_FRONTEND_URL=$(terraform output -raw frontend_url)
ACTUAL_BACKEND_URL=$(terraform output -raw backend_url)
URL_MATCH=$(terraform output -raw url_prediction_matches)
# 疎通確認は Cloud Run の URL で行う。カスタムドメインは DNS 伝播と
# 証明書発行に時間がかかり、デプロイ直後は必ず失敗するため。
HEALTH_URL=$(terraform output -raw backend_run_url)
cd ..

echo -e "\n${YELLOW}アクセス URL:${NC}"
echo "  Frontend: ${ACTUAL_FRONTEND_URL}"
echo "  Backend:  ${ACTUAL_BACKEND_URL}"

if [ "$URL_MATCH" != "true" ] && [ -z "$BACKEND_DOMAIN" ]; then
  echo -e "\n${RED}警告: 予測した Cloud Run URL が実際の URL と一致しませんでした。${NC}"
  echo "  infra/terraform.tfvars に以下を追記して、このスクリプトを再実行してください:"
  echo "    frontend_url = \"${ACTUAL_FRONTEND_URL}\""
  echo "    backend_url  = \"${ACTUAL_BACKEND_URL}\""
  exit 1
fi

# ===== Step 8: 疎通確認 =====
echo -e "\n${YELLOW}Step 8: ヘルスチェックを実行しています...${NC}"

HEALTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${HEALTH_URL}/health" || echo "000")

if [ "$HEALTH_CODE" = "200" ]; then
  echo -e "${GREEN}バックエンド正常 (/health -> 200)${NC}"
else
  echo -e "${RED}バックエンドのヘルスチェックが失敗しました (HTTP ${HEALTH_CODE})${NC}"
  echo "  ログを確認してください:"
  echo "    gcloud run services logs read app-gen-backend --region ${REGION} --limit 50"
  exit 1
fi

echo -e "\n${GREEN}デプロイ完了${NC}"
echo -e "  ${ACTUAL_FRONTEND_URL} をブラウザで開いてください。"

if [ -n "$BACKEND_DOMAIN" ]; then
  echo -e "\n${YELLOW}カスタムドメインの反映には DNS 伝播と証明書発行で最大 48 時間かかります。${NC}"
  echo "  それまでは Cloud Run の URL でアクセスできます:"
  echo "    ${HEALTH_URL}"
  echo "  設定すべき DNS レコード:"
  echo "    cd infra && terraform output frontend_dns_records"
  echo "    cd infra && terraform output backend_dns_records"
fi

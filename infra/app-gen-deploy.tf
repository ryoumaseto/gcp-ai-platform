# =====================================================================
# 生成アプリの実デプロイ機能に必要なリソース群
#
# AI が生成したコードを Cloud Build でビルドし、Cloud Run にデプロイする。
# 生成アプリは「バックエンド SA (app_gen) がビルド・デプロイの実行者」
# 「生成アプリ用 SA (app_gen_generated) が実行時の身元」という2層構成にする。
# 後者に権限を一切与えないことで、生成コードが任意にできてしまっても
# DB・Secret Manager・他 GCP API には到達できないようにする。
# =====================================================================

# ===== GCS: 生成コードのソース置き場 =====
# Cloud Build はソースを GCS 経由で受け取るため、ビルド対象の
# tarball/zip を一時的に置くバケットが必要。
resource "google_storage_bucket" "app_gen_source" {
  name     = "${var.gcp_project_id}-app-gen-source"
  location = var.gcp_region

  uniform_bucket_level_access = true

  # 生成コードのアーカイブは一時的なビルド入力に過ぎず、
  # 溜め続ける理由がないため 30 日で自動削除する。
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  # 中身は一時ファイルのみなので、destroy 時にオブジェクトごと
  # バケットを削除できてよい。
  force_destroy = true

  depends_on = [google_project_service.required_apis["cloudbuild.googleapis.com"]]
}

# ===== Artifact Registry: 生成アプリ専用イメージリポジトリ =====
# 既存の app_gen リポジトリ（frontend/backend 本体のイメージ）とは
# ライフサイクル・クォータ管理を分離するため別リポジトリにする。
# 生成アプリのイメージは頻繁に増減し、クリーンアップ方針も
# 本体とは異なるため混在させたくない。
resource "google_artifact_registry_repository" "app_gen_generated" {
  location      = var.gcp_region
  repository_id = "app-gen-generated"
  description   = "Generated app container images (built from AI-generated code)"
  format        = "DOCKER"

  depends_on = [google_project_service.required_apis["artifactregistry.googleapis.com"]]
}

# ===== 生成アプリ実行用のサービスアカウント（意図的に無権限） =====
# AI が生成した任意のコードがこの SA の身元で Cloud Run 上に動くため、
# DB・Secret Manager・他の GCP API へアクセスできてはならない。
# そのため IAM ロールは一切付与しない。生成アプリが正当に外部リソースへ
# アクセスする必要が出た場合は、個別に最小権限を検討してから付与すること。
resource "google_service_account" "app_gen_generated" {
  account_id   = "app-gen-generated"
  display_name = "Generated App Runtime (no permissions)"
}

# ===== バックエンド SA (app_gen) への権限追加: ビルド・デプロイの実行者 =====

# Cloud Build を起動してソースからコンテナイメージをビルドするために必要
resource "google_project_iam_member" "app_gen_cloudbuild_editor" {
  project = var.gcp_project_id
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.app_gen.email}"
}

# 生成アプリの Cloud Run サービスを作成・更新・削除するために必要
resource "google_project_iam_member" "app_gen_run_admin" {
  project = var.gcp_project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.app_gen.email}"
}

# ビルドしたイメージを Artifact Registry へ push するために必要
resource "google_project_iam_member" "app_gen_artifactregistry_writer" {
  project = var.gcp_project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.app_gen.email}"
}

# Cloud Run サービスに実行時 SA (app_gen_generated) を指定してデプロイするには
# 「そのSAとしてactAsする」権限が要る。プロジェクト全体に
# iam.serviceAccountUser を付与すると他の全 SA にもなりすませてしまうため、
# 対象を生成アプリ用 SA 1つに限定する。
resource "google_service_account_iam_member" "app_gen_can_act_as_generated" {
  service_account_id = google_service_account.app_gen_generated.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.app_gen.email}"
}

# 生成コードのソース tarball/zip を app_gen_source バケットへアップロード
# するために必要。プロジェクト全体ではなくこのバケットのみに限定する。
resource "google_storage_bucket_iam_member" "app_gen_source_object_admin" {
  bucket = google_storage_bucket.app_gen_source.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app_gen.email}"
}

# ===== Cloud Build 実行用サービスアカウント =====
# Cloud Build は既定で Compute Engine のデフォルト SA を使うが、
# それは他用途と共有され権限も読みにくい。専用 SA を明示的に用意し、
# ビルドに必要な 3 つだけを与える。
resource "google_service_account" "app_gen_builder" {
  account_id   = "app-gen-builder"
  display_name = "App Gen Cloud Build Runner"
}

# CLOUD_LOGGING_ONLY でビルドログを出すために必須
resource "google_project_iam_member" "builder_log_writer" {
  project = var.gcp_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.app_gen_builder.email}"
}

# ビルドしたイメージの push 先。生成アプリ用リポジトリのみに限定する
resource "google_artifact_registry_repository_iam_member" "builder_push" {
  project    = var.gcp_project_id
  location   = google_artifact_registry_repository.app_gen_generated.location
  repository = google_artifact_registry_repository.app_gen_generated.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.app_gen_builder.email}"
}

# ソース tar.gz の読み取り。書き込みは不要なので objectViewer に留める
resource "google_storage_bucket_iam_member" "builder_source_reader" {
  bucket = google_storage_bucket.app_gen_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.app_gen_builder.email}"
}

# バックエンドがこの SA を指定してビルドを起動できるようにする。
# 対象をこの SA 1 つに限定し、Compute デフォルト SA への act-as は与えない
# （そちらは他用途と共有されるため、権限昇格の経路になりうる）。
resource "google_service_account_iam_member" "app_gen_can_act_as_builder" {
  service_account_id = google_service_account.app_gen_builder.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.app_gen.email}"
}

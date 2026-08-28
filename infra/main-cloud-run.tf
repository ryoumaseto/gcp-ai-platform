data "google_project" "current" {}

locals {
  frontend_service_name = "app-gen-frontend"
  backend_service_name  = "app-gen-backend"

  # Cloud Run のデフォルト URL は
  #   https://{service}-{project_number}.{region}.run.app
  # で決まるため、frontend と backend が互いの URL を参照して
  # 循環依存になるのを避けられる。
  # 実際に払い出された URL が異なる場合は var.frontend_url / var.backend_url で上書きする
  # （apply 後に output frontend_url / backend_url を確認して tfvars に設定）。
  predicted_frontend_url = "https://${local.frontend_service_name}-${data.google_project.current.number}.${var.gcp_region}.run.app"
  predicted_backend_url  = "https://${local.backend_service_name}-${data.google_project.current.number}.${var.gcp_region}.run.app"

  frontend_url = var.frontend_url != "" ? var.frontend_url : local.predicted_frontend_url
  backend_url  = var.backend_url != "" ? var.backend_url : local.predicted_backend_url
}

# ===== Cloud Run: Frontend =====
resource "google_cloud_run_v2_service" "frontend" {
  name     = local.frontend_service_name
  location = var.gcp_region

  # 認証なしで公開する（アプリ側の JWT で保護）
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app_gen.email

    scaling {
      min_instance_count = var.enable_min_instance_count ? 1 : 0
      max_instance_count = 10
    }

    containers {
      image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/app-gen/frontend:latest"

      ports {
        container_port = 3000
      }

      # NEXT_PUBLIC_* はビルド時にバンドルへ埋め込まれるため、これは
      # サーバーサイドから参照する場合のフォールバック。
      # 実際のクライアント向け URL は Docker ビルド引数で指定すること
      # (deploy.sh が --build-arg NEXT_PUBLIC_API_URL を渡す)。
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = local.backend_url
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.frontend_memory
        }
      }

      startup_probe {
        tcp_socket {
          port = 3000
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 6
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.required_apis["run.googleapis.com"],
    google_artifact_registry_repository.app_gen,
  ]
}

# ===== Cloud Run: Backend =====
resource "google_cloud_run_v2_service" "backend" {
  name     = local.backend_service_name
  location = var.gcp_region

  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app_gen.email

    scaling {
      min_instance_count = var.enable_min_instance_count ? 1 : 0
      max_instance_count = 10
    }

    # Cloud SQL の Private IP へ到達するための VPC Connector
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/app-gen/backend:latest"

      ports {
        container_port = 3001
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      # Cloud Run は HTTPS で受け、x-forwarded-proto を付与する
      env {
        name  = "ENFORCE_HTTPS"
        value = "true"
      }

      env {
        name  = "PORT"
        value = "3001"
      }

      env {
        name  = "DB_DIALECT"
        value = "postgres"
      }

      # Cloud SQL は ssl_mode = ENCRYPTED_ONLY のため TLS 必須
      env {
        name  = "DB_SSL"
        value = "true"
      }

      env {
        name  = "DB_HOST"
        value = google_sql_database_instance.main.private_ip_address
      }

      env {
        name  = "DB_PORT"
        value = "5432"
      }

      env {
        name  = "DB_USER"
        value = google_sql_user.app_maker_user.name
      }

      env {
        name  = "DB_NAME"
        value = google_sql_database.app_maker.name
      }

      env {
        name  = "FRONTEND_URL"
        value = local.frontend_url
      }

      # ===== Secret Manager から注入 =====
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = var.backend_memory
        }
        # Gemini パイプラインはレスポンス返却後にバックグラウンドで走る。
        # 既定 (cpu_idle = true) だとレスポンス送出後に CPU がほぼ 0 に絞られ、
        # 生成処理が途中で停止して job が generating のまま残る。
        cpu_idle = false
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        initial_delay_seconds = 15
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 10
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.required_apis["run.googleapis.com"],
    google_sql_database_instance.main,
    google_vpc_access_connector.connector,
    google_secret_manager_secret_version.db_password,
    google_secret_manager_secret_version.jwt_secret,
    google_artifact_registry_repository.app_gen,
    google_secret_manager_secret_iam_member.app_gen_db_password,
    google_secret_manager_secret_iam_member.app_gen_jwt_secret,
    google_secret_manager_secret_iam_member.app_gen_gemini_api_key,
  ]
}

# ===== IAM: 未認証アクセスを許可 =====
resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  name     = google_cloud_run_v2_service.frontend.name
  location = var.gcp_region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  name     = google_cloud_run_v2_service.backend.name
  location = var.gcp_region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ===== Artifact Registry =====
resource "google_artifact_registry_repository" "app_gen" {
  location      = var.gcp_region
  repository_id = "app-gen"
  description   = "App Gen container images"
  format        = "DOCKER"

  depends_on = [google_project_service.required_apis["artifactregistry.googleapis.com"]]
}

# ===== Service Account =====
resource "google_service_account" "app_gen" {
  account_id   = "app-gen"
  display_name = "App Gen Service Account"
}

resource "google_project_iam_member" "app_gen_sql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app_gen.email}"
}

# プロジェクト全体に secretAccessor を付けると、このサービスアカウントが
# プロジェクト内の「全ての」シークレットを読めてしまう。
# 実際に必要な 3 つだけにスコープを絞る（最小権限）。
resource "google_secret_manager_secret_iam_member" "app_gen_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_gen.email}"
}

resource "google_secret_manager_secret_iam_member" "app_gen_jwt_secret" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_gen.email}"
}

resource "google_secret_manager_secret_iam_member" "app_gen_gemini_api_key" {
  secret_id = google_secret_manager_secret.gemini_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_gen.email}"
}

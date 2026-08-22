# Provider configuration is in backend.tf (required_providers, required_version)

# Google Provider 設定
provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "google-beta" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "random" {}

# ========== Phase 1: 初期運用（1～3ユーザー） ==========

# 必須 API 有効化
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudsql.googleapis.com",          # Cloud SQL
    "compute.googleapis.com",           # Compute Engine
    "iam.googleapis.com",               # IAM (for service accounts)
    "run.googleapis.com",               # Cloud Run
    "cloudbuild.googleapis.com",        # Cloud Build
    "artifactregistry.googleapis.com",  # Artifact Registry
    "workflows.googleapis.com",         # Cloud Workflows
    "pubsub.googleapis.com",            # Pub/Sub
    "cloudtasks.googleapis.com",        # Cloud Tasks
    "aiplatform.googleapis.com",        # Vertex AI
    "logging.googleapis.com",           # Cloud Logging
    "secretmanager.googleapis.com",     # Secret Manager
    "cloudkms.googleapis.com",          # Cloud KMS
    "servicenetworking.googleapis.com", # Service Networking
  ])

  service            = each.value
  disable_on_destroy = false
}

# Cloud SQL インスタンス（Phase 1）
module "cloud_sql_phase1" {
  source = "./modules/cloud-sql"

  project_id        = var.gcp_project_id
  region            = var.gcp_region
  instance_name     = "app-maker-main-db"
  database_version  = "POSTGRES_15"
  machine_type      = var.phase == "phase1" ? "db-f1-micro" : "db-g1-small"
  availability_type = var.phase == "phase1" ? "ZONAL" : "REGIONAL"
  enable_backup     = var.phase != "phase1"
  enable_ha_replica = var.phase != "phase1"

  # セキュリティ設定
  enable_public_ip = false
  require_ssl      = true

  # ネットワーク設定
  network_id         = google_compute_network.vpc.id
  network_name       = google_compute_network.vpc.name
  private_ip_address = "10.0.0.0/24"

  depends_on_vpc_connection = google_service_networking_connection.private_vpc_connection

  depends_on = [
    google_project_service.required_apis,
    google_service_networking_connection.private_vpc_connection
  ]
}

# VPC ネットワーク
resource "google_compute_network" "vpc" {
  name                    = "app-maker-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  depends_on              = [google_project_service.required_apis["compute.googleapis.com"]]
}

# Subnet（Private IP アクセス有効化）
resource "google_compute_subnetwork" "private_subnet" {
  name                     = "app-maker-subnet"
  ip_cidr_range            = "10.0.0.0/20"
  region                   = var.gcp_region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true

  depends_on = [google_compute_network.vpc]
}

# Service Networking 接続（Cloud SQL Private IP 用）
resource "google_compute_global_address" "private_ip_address" {
  name          = "google-managed-services-${google_compute_network.vpc.name}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id

  depends_on = [google_compute_network.vpc]
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]

  depends_on = [google_project_service.required_apis["servicenetworking.googleapis.com"]]
}

# ========== セキュリティ設定 ==========

# Cloud KMS キーリング＆キー（暗号化用）
resource "google_kms_key_ring" "app_maker_keys" {
  name     = "app-maker-keys"
  location = var.kms_location

  depends_on = [google_project_service.required_apis["cloudkms.googleapis.com"]]
}

resource "google_kms_crypto_key" "cloud_sql_key" {
  name            = "cloud-sql-key"
  key_ring        = google_kms_key_ring.app_maker_keys.id
  rotation_period = "7776000s" # 90日
  version_template {
    algorithm = "GOOGLE_SYMMETRIC_ENCRYPTION"
  }
}

# Secret Manager（JWT 秘密鍵、DB パスワード用）
resource "google_secret_manager_secret" "jwt_private_key" {
  secret_id = "jwt-private-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret" "jwt_public_key" {
  secret_id = "jwt-public-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis["secretmanager.googleapis.com"]]
}

# ========== Pub/Sub トピック ==========

module "pubsub_topics" {
  source = "./modules/pubsub"

  project_id = var.gcp_project_id

  topics = [
    "app-generation-start",
    "requirement-parsed",
    "requirement-approved",
    "code-generated",
    "tests-passed",
    "sandbox-ready",
    "app-deployed",
    "generation-failed",
  ]

  depends_on = [google_project_service.required_apis["pubsub.googleapis.com"]]
}

# ========== Cloud Run デプロイ ==========

module "cloud_run_home_app" {
  source = "./modules/cloud-run"

  project_id            = var.gcp_project_id
  region                = var.gcp_region
  service_name          = "home-app"
  image                 = "gcr.io/${var.gcp_project_id}/home-app:latest"
  min_instances         = var.phase == "phase1" ? 0 : 1
  max_instances         = var.phase == "phase1" ? 5 : 10
  memory                = "512Mi"
  cpu                   = "1"
  service_account_email = google_service_account.cloud_run_sa.email

  environment_variables = {
    NEXTAUTH_URL = "https://${var.domain_name}"
    LOG_LEVEL    = "info"
    ENVIRONMENT  = var.environment
  }

  depends_on = [
    google_project_service.required_apis["run.googleapis.com"],
    google_service_account.cloud_run_sa
  ]
}

# ========== サービスアカウント ==========

resource "google_service_account" "cloud_run_sa" {
  account_id   = "cloud-run-sa"
  display_name = "Cloud Run Service Account"

  depends_on = [google_project_service.required_apis["iam.googleapis.com"]]
}

resource "google_service_account" "workflow_sa" {
  account_id   = "workflow-sa"
  display_name = "Workflow Service Account"

  depends_on = [google_project_service.required_apis["iam.googleapis.com"]]
}

resource "google_service_account" "cloud_build_sa" {
  account_id   = "cloud-build-sa"
  display_name = "Cloud Build Service Account"

  depends_on = [google_project_service.required_apis["iam.googleapis.com"]]
}

# ========== IAM ロール割り当て（最小権限） ==========

# Cloud Run SA: Cloud SQL Executor + Secret Accessor
resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_project_iam_member" "cloud_run_secret_accessor" {
  project = var.gcp_project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_project_iam_member" "cloud_run_kms_decrypter" {
  project = var.gcp_project_id
  role    = "roles/cloudkms.cryptoKeyDecrypter"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Workflow SA: Pub/Sub Publisher + Cloud Tasks Dispatcher
resource "google_project_iam_member" "workflow_pubsub_publisher" {
  project = var.gcp_project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.workflow_sa.email}"
}

resource "google_project_iam_member" "workflow_tasks_runner" {
  project = var.gcp_project_id
  role    = "roles/cloudtasks.taskRunner"
  member  = "serviceAccount:${google_service_account.workflow_sa.email}"
}

# Cloud Build SA: Artifact Registry Writer + Cloud Run Developer
resource "google_project_iam_member" "cloud_build_artifact_writer" {
  project = var.gcp_project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cloud_build_sa.email}"
}

resource "google_project_iam_member" "cloud_build_run_developer" {
  project = var.gcp_project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.cloud_build_sa.email}"
}

# ========== Artifact Registry ==========

resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.gcp_region
  repository_id = "docker-repo"
  description   = "Docker container images for App Maker SaaS"
  format        = "DOCKER"

  depends_on = [google_project_service.required_apis["artifactregistry.googleapis.com"]]
}

# ========== Cloud Tasks キュー ==========

resource "google_cloud_tasks_queue" "app_generation_queue" {
  name     = "projects/${var.gcp_project_id}/locations/${var.gcp_region}/queues/app-generation-queue"
  location = var.gcp_region

  rate_limits {
    max_dispatches_per_second = var.phase == "phase1" ? 5 : 10
  }

  retry_config {
    max_retries = 5
    max_backoff = "3600s"
    min_backoff = "1s"
  }

  depends_on = [google_project_service.required_apis["cloudtasks.googleapis.com"]]
}

# ========== Cloud Monitoring アラート ==========

resource "google_monitoring_alert_policy" "cloud_sql_cpu" {
  display_name = "Cloud SQL CPU High"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilization > 70%"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" resource.type=\"cloudsql_database\" resource.label.database_id=\"${var.gcp_project_id}:app-maker-main-db\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.7
    }
  }

  notification_channels = var.notification_channels

  depends_on = [google_project_service.required_apis["monitoring.googleapis.com"]]
}

# ========== ローカル変数 ==========

locals {
  # v2.1 の構成に基づいたローカル変数
  phase_configs = {
    phase1 = {
      machine_type  = "db-f1-micro"
      min_instances = 0
      max_instances = 5
      monthly_cost  = 5000
    }
    phase2 = {
      machine_type  = "db-g1-small"
      min_instances = 1
      max_instances = 10
      monthly_cost  = 14000
    }
    phase3 = {
      machine_type  = "db-n1-standard-2"
      min_instances = 5
      max_instances = 20
      monthly_cost  = 38000
    }
  }

  tags = {
    project     = "app-maker-saas"
    environment = var.environment
    terraform   = "true"
    phase       = var.phase
  }
}

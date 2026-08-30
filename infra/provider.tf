terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region

  default_labels = var.labels
}

# Enable required Google Cloud APIs
# 個別のエイリアス resource を作ると同一 API を二重管理してしまうため、
# 参照は google_project_service.required_apis["<api>"] に統一する。
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "aiplatform.googleapis.com",
    # 生成アプリを Cloud Build 経由でビルド・デプロイするために必要
    "cloudbuild.googleapis.com",
    "storage.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

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

  default_labels {
    labels = var.labels
  }
}

# Enable required Google Cloud APIs
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
  ])

  service            = each.value
  disable_on_destroy = false
}

# Alias for specific APIs
resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["run.googleapis.com"]]
}

resource "google_project_service" "sql" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["sqladmin.googleapis.com"]]
}

resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["compute.googleapis.com"]]
}

resource "google_project_service" "vpc_connector" {
  service            = "vpcaccess.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["vpcaccess.googleapis.com"]]
}

resource "google_project_service" "secret_manager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["secretmanager.googleapis.com"]]
}

resource "google_project_service" "artifact_registry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["artifactregistry.googleapis.com"]]
}

resource "google_project_service" "service_networking" {
  service            = "servicenetworking.googleapis.com"
  disable_on_destroy = false

  depends_on = [google_project_service.required_apis["servicenetworking.googleapis.com"]]
}

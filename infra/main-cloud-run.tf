# ===== Cloud Run: Frontend =====
resource "google_cloud_run_service" "frontend" {
  name     = "app-gen-frontend"
  location = var.gcp_region

  template {
    spec {
      containers {
        image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/app-gen/frontend:latest"

        ports {
          container_port = 3000
        }

        env {
          name  = "NEXT_PUBLIC_API_URL"
          value = "https://${google_cloud_run_service.backend.status[0].url}"
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }

      service_account_name = google_service_account.app_gen.email
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_project_service.run]
}

# ===== Cloud Run: Backend =====
resource "google_cloud_run_service" "backend" {
  name     = "app-gen-backend"
  location = var.gcp_region

  template {
    spec {
      containers {
        image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/app-gen/backend:latest"

        ports {
          container_port = 3001
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.main.private_ip_address
        }

        env {
          name  = "DB_USER"
          value = "app_maker"
        }

        env {
          name  = "DB_NAME"
          value = "app_maker"
        }

        env {
          name  = "FRONTEND_URL"
          value = "https://${google_cloud_run_service.frontend.status[0].url}"
        }

        secrets {
          key       = "DB_PASSWORD"
          version   = google_secret_manager_secret_version.db_password.id
        }

        secrets {
          key       = "JWT_SECRET_KEY"
          version   = google_secret_manager_secret_version.jwt_secret.id
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }

      service_account_name = google_service_account.app_gen.email

      vpc_access {
        connector = google_vpc_access_connector.connector.id
        egress    = "ALL_TRAFFIC"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_project_service.run,
    google_sql_database_instance.main,
  ]
}

# ===== IAM: Make services public =====
resource "google_cloud_run_iam_member" "frontend_public" {
  service  = google_cloud_run_service.frontend.name
  location = var.gcp_region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_iam_member" "backend_public" {
  service  = google_cloud_run_service.backend.name
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

  depends_on = [google_project_service.artifact_registry]
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

resource "google_project_iam_member" "app_gen_secret_accessor" {
  project = var.gcp_project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.app_gen.email}"
}

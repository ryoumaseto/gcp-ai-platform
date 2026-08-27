# ===== Secret Manager: Database Password =====
resource "google_secret_manager_secret" "db_password" {
  secret_id = "app-gen-db-password"

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }

  depends_on = [google_project_service.secret_manager]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# ===== Secret Manager: JWT Secret =====
resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "app-gen-jwt-secret"

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }

  depends_on = [google_project_service.secret_manager]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = true
}

# ===== Output Secrets (for reference only) =====
output "db_password_secret" {
  value       = google_secret_manager_secret.db_password.id
  description = "Database password secret ID"
}

output "jwt_secret_secret" {
  value       = google_secret_manager_secret.jwt_secret.id
  description = "JWT secret ID"
}

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

  depends_on = [google_project_service.required_apis["secretmanager.googleapis.com"]]
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

  depends_on = [google_project_service.required_apis["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false # JWT 署名鍵は英数字のみで十分なエントロピー (64 文字 ≒ 380bit)
}

# ===== Secret Manager: Gemini API Key =====
# 値は Terraform では管理しない（tfstate に平文で残さないため）。
# 以下のコマンドで手動投入する:
#   echo -n "$GEMINI_API_KEY" | gcloud secrets versions add app-gen-gemini-api-key --data-file=-
resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "app-gen-gemini-api-key"

  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }

  depends_on = [google_project_service.required_apis["secretmanager.googleapis.com"]]
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

output "gemini_api_key_secret" {
  value       = google_secret_manager_secret.gemini_api_key.id
  description = "Gemini API key secret ID (populate manually with gcloud secrets versions add)"
}

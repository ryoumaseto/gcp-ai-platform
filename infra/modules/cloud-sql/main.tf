# Cloud SQL Module - PostgreSQL Instance for Multi-tenant SaaS

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Cloud SQL Instance
resource "google_sql_database_instance" "main" {
  name                = var.instance_name
  database_version    = var.database_version
  region              = var.region
  deletion_protection = true # Prevent accidental deletion

  settings {
    tier              = var.machine_type
    availability_type = var.availability_type
    disk_type         = "PD_SSD"
    disk_size         = 100
    disk_autoresize   = true

    # Backup configuration
    backup_configuration {
      enabled                        = var.enable_backup
      start_time                     = var.backup_start_time
      location                       = var.region
      point_in_time_recovery_enabled = var.enable_backup
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.retained_backups_count
      }
    }

    # IP configuration
    ip_configuration {
      ipv4_enabled    = false # No public IP
      private_network = var.network_id
      require_ssl     = true

      # Authorized networks (empty = no external access)
      authorized_networks = []
    }

    # Password validation policy
    password_validation_policy {
      min_length             = 32
      complexity             = "COMPLEXITY_DEFAULT"
      reuse_interval         = 5
      enable_password_policy = true
    }

    # Database flags for security
    database_flags {
      name  = "cloudsql_iam_authentication"
      value = "on"
    }

    database_flags {
      name  = "log_statement"
      value = "all" # Audit all statements
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "0"
    }

    # Maintenance window
    maintenance_window {
      kind         = "MAINTENANCE_WINDOW_KIND_MONTHLY"
      day          = 7 # Sunday
      hour         = 3 # 3 AM UTC
      update_track = "stable"
    }

    # Insights configuration (for monitoring)
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }

    # Data cache configuration (Phase 3+)
    # Requires Enterprise edition
    # data_cache_config {
    #   data_cache_enabled = var.enable_data_cache
    # }
  }

  depends_on = [var.depends_on_vpc_connection]
}

# Default user (postgres) password (stored in Secret Manager externally)
resource "random_password" "postgres_password" {
  length  = 32
  special = true
}

# Database root user
resource "google_sql_user" "postgres" {
  name     = "postgres"
  instance = google_sql_database_instance.main.name
  password = random_password.postgres_password.result
  type     = "BUILT_IN"
}

# Master database (public schema will be created here)
resource "google_sql_database" "master" {
  name      = "master"
  instance  = google_sql_database_instance.main.name
  charset   = var.database_charset
  collation = var.database_collation
}

# Firestore database for approval state (if needed)
resource "google_sql_database" "state" {
  name      = "state"
  instance  = google_sql_database_instance.main.name
  charset   = var.database_charset
  collation = var.database_collation
}

# HA Replica (if enabled)
resource "google_sql_database_instance" "ha_replica" {
  count                = var.enable_ha_replica ? 1 : 0
  name                 = "${var.instance_name}-ha-replica"
  database_version     = var.database_version
  region               = var.region
  master_instance_name = google_sql_database_instance.main.name
  deletion_protection  = true
  replica_configuration {
    kind              = "FAILOVER"
    availability_type = "REGIONAL"
  }

  settings {
    tier              = var.machine_type
    availability_type = "REGIONAL"
    disk_type         = "PD_SSD"
    disk_size         = 100
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
      require_ssl     = true
    }

    backup_configuration {
      enabled = false # Replica doesn't need backup
    }
  }

  depends_on = [google_sql_database_instance.main]
}

# Cloud SQL Auth Proxy service account
resource "google_service_account" "cloud_sql_auth_proxy" {
  account_id   = "cloud-sql-auth-proxy"
  display_name = "Cloud SQL Auth Proxy Service Account"
}

resource "google_project_iam_member" "cloud_sql_auth_proxy_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_sql_auth_proxy.email}"
}

# Cloud SQL export bucket (for backups/exports)
resource "google_storage_bucket" "sql_exports" {
  name          = "${var.project_id}-cloud-sql-exports"
  location      = var.region
  force_destroy = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type          = "Delete"
      storage_class = "NEARLINE"
    }
    condition {
      age = 90 # Delete after 90 days
    }
  }

  uniform_bucket_level_access = true
}

# Bucket IAM for Cloud SQL service account
resource "google_storage_bucket_iam_member" "sql_export_writer" {
  bucket = google_storage_bucket.sql_exports.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_sql_database_instance.main.service_account_email}"
}

locals {
  # Helper variables for output
  connection_parts = split(":", google_sql_database_instance.main.connection_name)
}

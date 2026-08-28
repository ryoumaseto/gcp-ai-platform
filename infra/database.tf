# ===== VPC Network for Cloud SQL =====
resource "google_compute_network" "vpc" {
  name                    = "app-gen-vpc"
  auto_create_subnetworks = true

  depends_on = [google_project_service.required_apis["compute.googleapis.com"]]
}

# ===== Private Service Connection =====
resource "google_compute_global_address" "private_ip_address" {
  name          = "app-gen-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id

  depends_on = [google_project_service.required_apis["servicenetworking.googleapis.com"]]
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]

  depends_on = [google_project_service.required_apis["servicenetworking.googleapis.com"]]
}

# ===== Cloud SQL Instance =====
resource "google_sql_database_instance" "main" {
  name             = "app-gen-db-${var.environment}"
  database_version = "POSTGRES_${var.db_version}"
  region           = var.gcp_region

  deletion_protection = var.environment == "prod" ? true : false

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 20

    # Backup Configuration
    backup_configuration {
      enabled                        = var.db_backup_enabled
      start_time                     = "03:00"
      point_in_time_recovery_enabled = var.environment == "prod"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    # IP Configuration（Public IP なし、Private IP のみ、TLS 必須）
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # Database Flags
    database_flags {
      name  = "log_statement"
      value = "all"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    # Maintenance Window
    maintenance_window {
      day          = 7 # Sunday
      hour         = 3 # 3 AM UTC
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = var.environment == "prod"
      query_string_length     = 1024
      record_application_tags = true
    }
  }

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# ===== Database =====
resource "google_sql_database" "app_maker" {
  name     = "app_maker"
  instance = google_sql_database_instance.main.name

  depends_on = [google_sql_database_instance.main]
}

# ===== Database User =====
resource "google_sql_user" "app_maker_user" {
  name     = "app_maker"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result

  depends_on = [google_sql_database_instance.main]
}

# SSL/TLS の強制は settings.ip_configuration.ssl_mode = "ENCRYPTED_ONLY" で設定済み。
# （google_sql_database_instance_flag というリソースタイプは provider に存在しない）

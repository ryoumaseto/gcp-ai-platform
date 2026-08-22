# Cloud Run Module - Containerized App Deployment

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Cloud Run Service
resource "google_cloud_run_service" "main" {
  name     = var.service_name
  location = var.region

  template {
    spec {
      service_account_name = var.service_account_email
      timeout_seconds      = var.timeout_seconds
      memory_limit         = var.memory
      cpu_throttling       = var.cpu_throttling

      containers {
        image = var.image

        resources {
          limits = {
            memory = var.memory
            cpu    = var.cpu
          }
        }

        # Environment variables
        dynamic "env" {
          for_each = var.environment_variables
          content {
            name  = env.key
            value = env.value
          }
        }

        # Secret environment variables
        dynamic "env" {
          for_each = var.secret_environment_variables
          content {
            name = env.key
            value_from {
              secret_key_ref {
                name = env.value.secret_name
                key  = env.value.version
              }
            }
          }
        }

        # Ports
        ports {
          container_port = var.container_port
          name           = "http1"
        }

        # Health checks
        liveness_probe {
          http_get {
            path = var.health_check_path
            port = var.container_port
          }
          initial_delay_seconds = 10
          period_seconds        = 10
        }

        startup_probe {
          http_get {
            path = var.health_check_path
            port = var.container_port
          }
          initial_delay_seconds = 5
          period_seconds        = 5
        }
      }

      # Scaling configuration
      min_instances = var.min_instances
      max_instances = var.max_instances
    }

    metadata {
      labels = var.labels
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  # depends_on handled at module level if needed
}

# IAM: Allow unauthenticated access (if enabled)
resource "google_cloud_run_service_iam_member" "unauthenticated" {
  count    = var.allow_unauthenticated ? 1 : 0
  service  = google_cloud_run_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
  location = var.region
}

# IAM: Service-to-service authentication
resource "google_cloud_run_service_iam_member" "authenticated" {
  for_each = toset(var.allowed_service_accounts)

  service  = google_cloud_run_service.main.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${each.value}"
  location = var.region
}

# Firewall rule (if using VPC Connector)
resource "google_compute_firewall_rule" "cloud_run_egress" {
  count   = var.use_vpc_connector ? 1 : 0
  name    = "${var.service_name}-vpc-egress"
  network = var.vpc_network_name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["cloud-run"]
}

# Output information
locals {
  service_url = google_cloud_run_service.main.status[0].url
}

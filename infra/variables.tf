variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.gcp_project_id))
    error_message = "GCP Project ID must be a valid format (e.g., 'app-maker-dev-12345')."
  }
}

variable "gcp_region" {
  description = "GCP Region for resources"
  type        = string
  default     = "us-central1"
  validation {
    condition     = contains(["us-central1", "us-east1", "europe-west1", "asia-northeast1"], var.gcp_region)
    error_message = "Region must be one of: us-central1, us-east1, europe-west1, asia-northeast1."
  }
}

variable "kms_location" {
  description = "Cloud KMS location (global for most keys)"
  type        = string
  default     = "global"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "phase" {
  description = "Implementation phase (phase1, phase2, phase3)"
  type        = string
  default     = "phase1"
  validation {
    condition     = contains(["phase1", "phase2", "phase3"], var.phase)
    error_message = "Phase must be one of: phase1, phase2, phase3."
  }
}

variable "domain_name" {
  description = "Domain name for the application (e.g., example.com)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$", var.domain_name))
    error_message = "Domain name must be a valid format."
  }
}

variable "notification_channels" {
  description = "Cloud Monitoring notification channel IDs"
  type        = list(string)
  default     = []
}

variable "enable_backup" {
  description = "Enable Cloud SQL automated backups"
  type        = bool
  default     = true
}

variable "backup_start_time" {
  description = "Cloud SQL backup start time (HH:MM format)"
  type        = string
  default     = "02:00"
}

variable "retained_backups_count" {
  description = "Number of automated backups to retain"
  type        = number
  default     = 7
  validation {
    condition     = var.retained_backups_count >= 1 && var.retained_backups_count <= 35
    error_message = "Retained backups count must be between 1 and 35."
  }
}

variable "database_charset" {
  description = "Database character set"
  type        = string
  default     = "UTF8"
}

variable "database_collation" {
  description = "Database collation"
  type        = string
  default     = "en_US.UTF8"
}

variable "cloud_run_memory" {
  description = "Cloud Run memory allocation"
  type        = string
  default     = "512Mi"
  validation {
    condition     = contains(["128Mi", "256Mi", "512Mi", "1Gi", "2Gi", "4Gi"], var.cloud_run_memory)
    error_message = "Memory must be one of: 128Mi, 256Mi, 512Mi, 1Gi, 2Gi, 4Gi."
  }
}

variable "cloud_run_cpu" {
  description = "Cloud Run CPU allocation"
  type        = string
  default     = "1"
  validation {
    condition     = contains(["0.25", "0.5", "1", "2", "4"], var.cloud_run_cpu)
    error_message = "CPU must be one of: 0.25, 0.5, 1, 2, 4."
  }
}

variable "labels" {
  description = "Common labels to apply to all resources"
  type        = map(string)
  default = {
    project = "app-maker-saas"
    managed = "terraform"
  }
}

# API Configuration
variable "enable_apis" {
  description = "List of GCP APIs to enable"
  type        = list(string)
  default = [
    "cloudsql.googleapis.com",
    "compute.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "workflows.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "aiplatform.googleapis.com",
    "logging.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudkms.googleapis.com",
  ]
}

# Network Configuration
variable "vpc_cidr" {
  description = "VPC CIDR range"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "Subnet CIDR range"
  type        = string
  default     = "10.0.0.0/20"
}

# Database Configuration
variable "postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_15"
  validation {
    condition     = can(regex("^POSTGRES_1[5-6]$", var.postgres_version))
    error_message = "PostgreSQL version must be POSTGRES_15 or POSTGRES_16."
  }
}

variable "database_tier" {
  description = "Cloud SQL database tier"
  type        = string
  default     = "db-f1-micro"
}

variable "max_connections" {
  description = "Maximum database connections"
  type        = number
  default     = 100
}

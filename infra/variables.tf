# ===== GCP Project Configuration =====
variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string

  validation {
    condition     = length(var.gcp_project_id) > 0
    error_message = "GCP project ID cannot be empty"
  }
}

variable "gcp_region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

# ===== Database Configuration =====
variable "db_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15"
}

variable "db_tier" {
  description = "Cloud SQL machine type"
  type        = string
  default     = "db-f1-micro"
}

variable "db_backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

# ===== Cloud Run Configuration =====
variable "frontend_memory" {
  description = "Frontend memory allocation"
  type        = string
  default     = "512Mi"

  validation {
    condition     = contains(["256Mi", "512Mi", "1Gi", "2Gi", "4Gi"], var.frontend_memory)
    error_message = "Valid options: 256Mi, 512Mi, 1Gi, 2Gi, 4Gi"
  }
}

variable "backend_memory" {
  description = "Backend memory allocation"
  type        = string
  default     = "512Mi"

  validation {
    condition     = contains(["256Mi", "512Mi", "1Gi", "2Gi", "4Gi"], var.backend_memory)
    error_message = "Valid options: 256Mi, 512Mi, 1Gi, 2Gi, 4Gi"
  }
}

variable "enable_min_instance_count" {
  description = "Enable minimum instance count for Cloud Run (avoids cold starts, increases cost)"
  type        = bool
  default     = false
}

# Cloud Run のデフォルト URL は project number から決まるため通常は設定不要。
# 初回 apply 後に output と食い違う場合のみ、実際の URL をここに設定して再 apply する。
variable "frontend_url" {
  description = "Override for the frontend URL (used for backend CORS). Empty = derive from project number."
  type        = string
  default     = ""
}

variable "backend_url" {
  description = "Override for the backend URL (used for frontend API calls). Empty = derive from project number."
  type        = string
  default     = ""
}

# ===== Security Configuration =====
variable "cors_allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "enable_https_only" {
  description = "Force HTTPS for all traffic"
  type        = bool
  default     = true
}

# ===== Tags =====
variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default = {
    project     = "app-gen"
    managed_by  = "terraform"
    environment = "production"
  }
}

# ===== Gemini =====
variable "gemini_provider" {
  description = "Where to call Gemini: vertex (service account auth, no API key) or aistudio (API key)"
  type        = string
  default     = "vertex"

  validation {
    condition     = contains(["vertex", "aistudio"], var.gemini_provider)
    error_message = "gemini_provider must be vertex or aistudio"
  }
}

variable "vertex_location" {
  description = "Vertex AI region for Gemini calls"
  type        = string
  default     = "us-central1"
}

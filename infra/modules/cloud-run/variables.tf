variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Run"
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
}

variable "image" {
  description = "Container image URL"
  type        = string
}

variable "memory" {
  description = "Memory allocation (128Mi, 256Mi, 512Mi, 1Gi, 2Gi, 4Gi)"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU allocation (0.25, 0.5, 1, 2, 4)"
  type        = string
  default     = "1"
}

variable "cpu_throttling" {
  description = "Enable CPU throttling"
  type        = bool
  default     = true
}

variable "timeout_seconds" {
  description = "Request timeout in seconds"
  type        = number
  default     = 60
  validation {
    condition     = var.timeout_seconds >= 1 && var.timeout_seconds <= 3600
    error_message = "Timeout must be between 1 and 3600 seconds."
  }
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
  validation {
    condition     = var.min_instances >= 0
    error_message = "Min instances must be >= 0."
  }
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 100
  validation {
    condition     = var.max_instances > 0
    error_message = "Max instances must be > 0."
  }
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "Health check endpoint path"
  type        = string
  default     = "/health"
}

variable "service_account_email" {
  description = "Service account email for Cloud Run"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables (key-value pairs)"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret environment variables from Secret Manager"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {}
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access"
  type        = bool
  default     = false
}

variable "allowed_service_accounts" {
  description = "Service accounts allowed to invoke the service"
  type        = list(string)
  default     = []
}

variable "use_vpc_connector" {
  description = "Use VPC Connector for private network access"
  type        = bool
  default     = false
}

variable "vpc_connector_name" {
  description = "VPC Connector name (if use_vpc_connector=true)"
  type        = string
  default     = ""
}

variable "vpc_network_name" {
  description = "VPC network name"
  type        = string
  default     = ""
}

variable "labels" {
  description = "Labels for Cloud Run service"
  type        = map(string)
  default     = {}
}

variable "depends_on_resources" {
  description = "Resources to depend on"
  type        = any
  default     = null
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "instance_name" {
  description = "Cloud SQL instance name"
  type        = string
}

variable "database_version" {
  description = "PostgreSQL version (e.g., POSTGRES_15)"
  type        = string
  default     = "POSTGRES_15"
}

variable "machine_type" {
  description = "Cloud SQL machine type (e.g., db-f1-micro, db-g1-small, db-n1-standard-2)"
  type        = string
  default     = "db-f1-micro"
}

variable "availability_type" {
  description = "Availability type (ZONAL or REGIONAL)"
  type        = string
  default     = "ZONAL"
}

variable "enable_backup" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_start_time" {
  description = "Backup start time (HH:MM format)"
  type        = string
  default     = "02:00"
}

variable "retained_backups_count" {
  description = "Number of automated backups to retain"
  type        = number
  default     = 7
}

variable "enable_public_ip" {
  description = "Enable public IP (NOT recommended for production)"
  type        = bool
  default     = false
}

variable "require_ssl" {
  description = "Require SSL for connections"
  type        = bool
  default     = true
}

variable "network_id" {
  description = "VPC network ID for private IP connection"
  type        = string
}

variable "network_name" {
  description = "VPC network name"
  type        = string
}

variable "private_ip_address" {
  description = "Private IP range for Cloud SQL"
  type        = string
  default     = "10.0.0.0/24"
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

variable "enable_ha_replica" {
  description = "Enable HA failover replica"
  type        = bool
  default     = false
}

variable "enable_data_cache" {
  description = "Enable data cache (requires Enterprise edition)"
  type        = bool
  default     = false
}

variable "depends_on_vpc_connection" {
  description = "Resource to depend on (VPC Service Connection)"
  type        = any
  default     = null
}

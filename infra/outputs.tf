# ===== Cloud Run URLs =====
output "frontend_url" {
  description = "Frontend application URL"
  value       = "https://${google_cloud_run_service.frontend.status[0].url}"
}

output "backend_url" {
  description = "Backend API URL"
  value       = "https://${google_cloud_run_service.backend.status[0].url}"
}

# ===== Cloud SQL =====
output "database_connection_name" {
  description = "Cloud SQL connection name for cloudsql-proxy"
  value       = google_sql_database_instance.main.connection_name
}

output "database_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_host" {
  description = "Database hostname"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_port" {
  description = "Database port"
  value       = 5432
}

output "database_name" {
  description = "Database name"
  value       = "app_maker"
}

output "database_user" {
  description = "Database user"
  value       = "app_maker"
}

# ===== Service Accounts =====
output "app_gen_service_account" {
  description = "App Gen service account email"
  value       = google_service_account.app_gen.email
}

# ===== Network =====
output "vpc_connector_id" {
  description = "VPC Connector ID"
  value       = google_vpc_access_connector.connector.id
}

# ===== Deployment Summary =====
output "deployment_info" {
  description = "Quick deployment reference"
  value = {
    project_id         = var.gcp_project_id
    region             = var.gcp_region
    frontend_service   = google_cloud_run_service.frontend.name
    backend_service    = google_cloud_run_service.backend.name
    database_instance  = google_sql_database_instance.main.name
    security_level     = "HIGH (100-point security audit)"
  }
}

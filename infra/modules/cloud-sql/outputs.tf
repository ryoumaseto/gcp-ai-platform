output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "instance_id" {
  description = "Cloud SQL instance ID"
  value       = google_sql_database_instance.main.id
}

output "connection_name" {
  description = "Cloud SQL instance connection name (for Auth Proxy)"
  value       = google_sql_database_instance.main.connection_name
}

output "private_ip_address" {
  description = "Cloud SQL instance private IP address"
  value       = google_sql_database_instance.main.private_ip_address
}

output "public_ip_address" {
  description = "Cloud SQL instance public IP address (if enabled)"
  value       = try(google_sql_database_instance.main.public_ip_address, "")
}

output "service_account_email" {
  description = "Cloud SQL service account email"
  value       = google_sql_database_instance.main.service_account_email
}

output "postgres_password" {
  description = "PostgreSQL postgres user password (store in Secret Manager)"
  value       = random_password.postgres_password.result
  sensitive   = true
}

output "database_url" {
  description = "PostgreSQL connection URL"
  value       = "postgresql://postgres:${random_password.postgres_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/master"
  sensitive   = true
}

output "auth_proxy_connection_string" {
  description = "Auth Proxy connection string"
  value       = "postgresql://postgres:PASSWORD@127.0.0.1:5432/master"
}

output "master_database_name" {
  description = "Master database name"
  value       = google_sql_database.master.name
}

output "state_database_name" {
  description = "State database name"
  value       = google_sql_database.state.name
}

output "ha_replica_instance_name" {
  description = "HA replica instance name (if enabled)"
  value       = try(google_sql_database_instance.ha_replica[0].name, "")
}

output "ha_replica_connection_name" {
  description = "HA replica connection name (if enabled)"
  value       = try(google_sql_database_instance.ha_replica[0].connection_name, "")
}

output "sql_export_bucket_name" {
  description = "GCS bucket name for SQL exports"
  value       = google_storage_bucket.sql_exports.name
}

output "sql_auth_proxy_service_account" {
  description = "Cloud SQL Auth Proxy service account email"
  value       = google_service_account.cloud_sql_auth_proxy.email
}

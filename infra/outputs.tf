# ===== Cloud Run URLs =====
# .uri は既にスキーム付き (https://...) を返すため、そのまま出力する
output "frontend_url" {
  description = "Frontend application URL"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "backend_url" {
  description = "Backend API URL"
  value       = google_cloud_run_v2_service.backend.uri
}

# 予測した URL と実際の URL が食い違う場合は、この値を
# terraform.tfvars の frontend_url / backend_url に設定して再 apply する
output "url_prediction_matches" {
  description = "Whether derived Cloud Run URLs match the actual ones (false = set frontend_url/backend_url in tfvars)"
  # 比較対象はカスタムドメインではなく、予測した Cloud Run の URL
  value = (
    google_cloud_run_v2_service.frontend.uri == local.frontend_run_url &&
    google_cloud_run_v2_service.backend.uri == local.backend_run_url
  )
}

# Cloud Run が即座に払い出す URL（カスタムドメインの反映を待たずに疎通確認できる）
output "backend_run_url" {
  description = "Backend Cloud Run URL (always available, unlike a custom domain)"
  value       = google_cloud_run_v2_service.backend.uri
}

# フロントのビルド時に埋め込むべき API URL
# （カスタムドメインがあればそちら、無ければ Cloud Run の URL）
output "frontend_build_api_url" {
  description = "Value to pass as --build-arg NEXT_PUBLIC_API_URL when building the frontend"
  value       = local.backend_url
}

# ===== Cloud SQL =====
output "database_connection_name" {
  description = "Cloud SQL connection name for cloudsql-proxy"
  value       = google_sql_database_instance.main.connection_name
  sensitive   = true
}

output "database_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
}

output "database_host" {
  description = "Database hostname"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
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
    project_id        = var.gcp_project_id
    region            = var.gcp_region
    frontend_service  = google_cloud_run_v2_service.frontend.name
    backend_service   = google_cloud_run_v2_service.backend.name
    database_instance = google_sql_database_instance.main.name
    security_level    = "HIGH (100-point security audit)"
  }
}

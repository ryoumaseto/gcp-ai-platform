# ===== カスタムドメイン設定 (オプション) =====
# Cloud Run に カスタムドメインをマッピング

variable "frontend_domain" {
  description = "Frontend カスタムドメイン (オプション)"
  type        = string
  default     = ""
}

variable "backend_domain" {
  description = "Backend カスタムドメイン (オプション)"
  type        = string
  default     = ""
}

# ===== Cloud Run Domain Mapping (Frontend) =====
resource "google_cloud_run_domain_mapping" "frontend" {
  count    = var.frontend_domain != "" ? 1 : 0
  location = var.gcp_region
  name     = var.frontend_domain

  metadata {
    namespace = var.gcp_project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.frontend.name
  }
}

# ===== Cloud Run Domain Mapping (Backend) =====
resource "google_cloud_run_domain_mapping" "backend" {
  count    = var.backend_domain != "" ? 1 : 0
  location = var.gcp_region
  name     = var.backend_domain

  metadata {
    namespace = var.gcp_project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.backend.name
  }
}

# ===== DNS Record 情報出力 =====
output "frontend_dns_records" {
  description = "Frontend ドメイン用 DNS レコード"
  value = var.frontend_domain != "" ? {
    domain       = var.frontend_domain
    cname_target = google_cloud_run_domain_mapping.frontend[0].status[0].resource_records[0].rrdata
    type         = "CNAME"
  } : null
}

output "backend_dns_records" {
  description = "Backend ドメイン用 DNS レコード"
  value = var.backend_domain != "" ? {
    domain       = var.backend_domain
    cname_target = google_cloud_run_domain_mapping.backend[0].status[0].resource_records[0].rrdata
    type         = "CNAME"
  } : null
}

# ===== 実際にアクセスする URL =====
output "public_frontend_url" {
  description = "利用者がアクセスする Frontend URL"
  value       = var.frontend_domain == "" ? google_cloud_run_v2_service.frontend.uri : "https://${var.frontend_domain}"
}

output "public_backend_url" {
  description = "利用者がアクセスする Backend URL"
  value       = var.backend_domain == "" ? google_cloud_run_v2_service.backend.uri : "https://${var.backend_domain}"
}

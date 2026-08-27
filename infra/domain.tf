# ===== カスタムドメイン設定 (オプション) =====
# Cloud Run に カスタムドメインをマッピング

# 変数で定義
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

  spec {
    route_name = google_cloud_run_service.frontend.name
  }

  depends_on = [google_cloud_run_service.frontend]
}

# ===== Cloud Run Domain Mapping (Backend) =====
resource "google_cloud_run_domain_mapping" "backend" {
  count    = var.backend_domain != "" ? 1 : 0
  location = var.gcp_region
  name     = var.backend_domain

  spec {
    route_name = google_cloud_run_service.backend.name
  }

  depends_on = [google_cloud_run_service.backend]
}

# ===== DNS Record 情報出力 =====
output "frontend_dns_records" {
  description = "Frontend ドメイン用 DNS レコード"
  value = var.frontend_domain != "" ? {
    domain       = var.frontend_domain
    cname_target = google_cloud_run_domain_mapping.frontend[0].status[0].resource_records[0].rrdata
    type         = "CNAME"
  } : "Custom domain not configured"
}

output "backend_dns_records" {
  description = "Backend ドメイン用 DNS レコード"
  value = var.backend_domain != "" ? {
    domain       = var.backend_domain
    cname_target = google_cloud_run_domain_mapping.backend[0].status[0].resource_records[0].rrdata
    type         = "CNAME"
  } : "Custom domain not configured"
}

# ===== 現在のデフォルト URL =====
output "default_frontend_url" {
  description = "デフォルト Frontend URL (カスタムドメインなし時)"
  value       = var.frontend_domain == "" ? "https://${google_cloud_run_service.frontend.status[0].url}" : "https://${var.frontend_domain}"
}

output "default_backend_url" {
  description = "デフォルト Backend URL (カスタムドメインなし時)"
  value       = var.backend_domain == "" ? "https://${google_cloud_run_service.backend.status[0].url}" : "https://${var.backend_domain}"
}

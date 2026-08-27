# ===== VPC Connector for Cloud Run → Cloud SQL =====
resource "google_vpc_access_connector" "connector" {
  name           = "app-gen-connector"
  region         = var.gcp_region
  ip_cidr_range  = "10.8.0.0/28"
  network        = google_compute_network.vpc.name
  machine_type   = "e2-micro"
  min_throughput = 200
  max_throughput = 300

  depends_on = [google_project_service.vpc_connector]
}

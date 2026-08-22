output "cloud_sql_instance_name" {
  description = "Cloud SQL instance name"
  value       = module.cloud_sql_phase1.instance_name
}

output "cloud_sql_instance_connection_name" {
  description = "Cloud SQL instance connection name (for Auth Proxy)"
  value       = module.cloud_sql_phase1.connection_name
  sensitive   = true # Hide from logs (can deduce infrastructure)
}

output "cloud_sql_instance_private_ip" {
  description = "Cloud SQL instance private IP address"
  value       = module.cloud_sql_phase1.private_ip_address
}

output "cloud_sql_database_url" {
  description = "Cloud SQL connection URL (postgres://)"
  value       = module.cloud_sql_phase1.database_url
  sensitive   = true # Hide from logs (contains credentials)
}

output "cloud_run_home_app_url" {
  description = "Home App Cloud Run service URL"
  value       = module.cloud_run_home_app.service_url
}

output "cloud_run_home_app_service_name" {
  description = "Home App Cloud Run service name"
  value       = module.cloud_run_home_app.service_name
}

output "vpc_network_id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "vpc_network_name" {
  description = "VPC network name"
  value       = google_compute_network.vpc.name
}

output "subnet_id" {
  description = "Subnet ID"
  value       = google_compute_subnetwork.private_subnet.id
}

output "subnet_name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.private_subnet.name
}

output "kms_key_ring_id" {
  description = "Cloud KMS key ring ID"
  value       = google_kms_key_ring.app_maker_keys.id
}

output "kms_crypto_key_id" {
  description = "Cloud KMS crypto key ID"
  value       = google_kms_crypto_key.cloud_sql_key.id
}

output "pubsub_topics" {
  description = "Created Pub/Sub topics"
  value       = module.pubsub_topics.topic_names
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository name"
  value       = google_artifact_registry_repository.docker_repo.repository_id
}

output "artifact_registry_repository_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.docker_repo.repository_id}"
}

output "cloud_tasks_queue_name" {
  description = "Cloud Tasks queue name"
  value       = google_cloud_tasks_queue.app_generation_queue.name
}

output "service_account_cloud_run" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run_sa.email
}

output "service_account_workflow" {
  description = "Workflow service account email"
  value       = google_service_account.workflow_sa.email
}

output "service_account_cloud_build" {
  description = "Cloud Build service account email"
  value       = google_service_account.cloud_build_sa.email
}

output "secret_manager_jwt_private_key_id" {
  description = "Secret Manager JWT private key ID"
  value       = google_secret_manager_secret.jwt_private_key.id
  sensitive   = true # Secret ID may reveal infrastructure details
}

output "secret_manager_jwt_public_key_id" {
  description = "Secret Manager JWT public key ID"
  value       = google_secret_manager_secret.jwt_public_key.id
  sensitive   = true # Secret ID may reveal infrastructure details
}

# Phase configuration summary
output "phase_summary" {
  description = "Current phase configuration"
  value = {
    phase         = var.phase
    environment   = var.environment
    region        = var.gcp_region
    database_tier = var.database_tier
    min_instances = var.phase == "phase1" ? 0 : (var.phase == "phase2" ? 1 : 5)
    max_instances = var.phase == "phase1" ? 5 : (var.phase == "phase2" ? 10 : 20)
  }
}

# Important URLs and endpoints
output "endpoints" {
  description = "Important endpoints for the application"
  value = {
    home_app_url          = module.cloud_run_home_app.service_url
    artifact_registry_url = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.docker_repo.repository_id}"
    cloud_sql_connection  = module.cloud_sql_phase1.connection_name
    domain_name           = var.domain_name
  }
}

# Next steps
output "next_steps" {
  description = "Next steps after terraform apply"
  value       = <<-EOT
## Next Steps:

1. **Set up DNS for Pub/Sub webhooks:**
   - Add A records for webhook endpoints pointing to Cloud Run LB

2. **Populate Secret Manager:**
   - gcloud secrets versions add jwt-private-key --data-file=jwt-key.pem
   - gcloud secrets versions add jwt-public-key --data-file=jwt-key.pub

3. **Initialize Cloud SQL database:**
   - Create databases in Cloud SQL (schema creation scripts available in ../doc/)
   - Run: psql -h ${module.cloud_sql_phase1.private_ip_address} -U postgres < schema.sql

4. **Deploy Home App:**
   - Build Docker image: docker build -t gcr.io/${var.gcp_project_id}/home-app .
   - Push to Artifact Registry
   - Update Cloud Run service with new image

5. **Set up Cloud Workflows:**
   - Deploy workflow.yaml to Cloud Workflows
   - Configure Pub/Sub topic subscriptions

6. **Create Firestore database (for approval state management):**
   - gcloud firestore databases create --location=${var.gcp_region}

7. **Monitor and alert:**
   - Check Cloud Monitoring for metrics
   - Set up log sinks for Cloud Logging

## Important Notes:
- All databases use Private IP only (no public access)
- Backups start at ${var.backup_start_time} UTC
- Minimum of ${var.retained_backups_count} automated backups retained
- Cloud KMS encryption enabled for database at rest
EOT
}

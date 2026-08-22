output "service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_service.main.name
}

output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_service.main.status[0].url
}

output "service_id" {
  description = "Cloud Run service ID"
  value       = google_cloud_run_service.main.id
}

output "latest_revision_name" {
  description = "Latest revision name"
  value       = google_cloud_run_service.main.status[0].latest_revision_name
}

output "latest_revision_url" {
  description = "Latest revision URL"
  value       = google_cloud_run_service.main.status[0].latest_revision_url
}

output "revision_list" {
  description = "List of revisions"
  value       = google_cloud_run_service.main.status[0].revision_statuses
}

output "deployment_command" {
  description = "gcloud command to deploy this service"
  value       = "gcloud run deploy ${google_cloud_run_service.main.name} --image=<IMAGE> --region=${var.region}"
}

output "logs_command" {
  description = "gcloud command to view logs"
  value       = "gcloud logging read \"resource.type=cloud_run_resource AND resource.labels.service_name=${google_cloud_run_service.main.name}\" --limit 50"
}

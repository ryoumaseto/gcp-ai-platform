# ===== Remote State Backend =====
# Initialize with: terraform init -backend-config="bucket=YOUR_BUCKET" -backend-config="prefix=app-gen"
# Or set GCS_BUCKET environment variable

terraform {
  backend "gcs" {
    # Configure via environment or terraform init flags:
    # TF_BACKEND_GCS_BUCKET=your-bucket
    # terraform init -backend-config="bucket=your-bucket" -backend-config="prefix=app-gen"
  }
}

# ===== Cloud Storage Bucket for State (Optional - Create Once) =====
# Uncomment this if running terraform for the first time
# resource "google_storage_bucket" "terraform_state" {
#   name          = "${var.gcp_project_id}-terraform-state"
#   location      = var.gcp_region
#   force_destroy = false
#
#   uniform_bucket_level_access = true
#
#   versioning {
#     enabled = true
#   }
#
#   encryption {
#     default_kms_key_name = google_kms_crypto_key.terraform_state.id
#   }
#
#   lifecycle {
#     prevent_destroy = true
#   }
# }

# ===== KMS Key for State Encryption (Optional) =====
# resource "google_kms_key_ring" "terraform" {
#   name     = "terraform-state-keys"
#   location = var.gcp_region
# }
#
# resource "google_kms_crypto_key" "terraform_state" {
#   name            = "terraform-state-key"
#   key_ring        = google_kms_key_ring.terraform.id
#   rotation_period = "7776000s" # 90 days
#
#   lifecycle {
#     prevent_destroy = true
#   }
# }

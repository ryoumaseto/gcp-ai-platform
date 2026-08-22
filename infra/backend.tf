terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # GCS Remote Backend with Encryption
  # Setup steps:
  # 1. Create GCS bucket:
  #    gsutil mb -p YOUR_PROJECT_ID -l us-central1 \
  #      gs://YOUR_PROJECT_ID-terraform-state
  # 2. Enable versioning:
  #    gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state
  # 3. Block public access:
  #    gsutil uniformbucketlevelaccess set on gs://YOUR_PROJECT_ID-terraform-state
  # 4. Update bucket name below with YOUR_PROJECT_ID
  # 5. Run: terraform init

  backend "gcs" {
    bucket = "YOUR_PROJECT_ID-terraform-state" # CHANGE THIS to your project ID
    prefix = "app-maker-saas"

    # Optional: Uncomment after creating KMS key for client-side encryption
    # encryption_key = "projects/YOUR_PROJECT_ID/locations/global/keyRings/terraform/cryptoKeys/state"
  }
}

# State file security:
# ✓ GCS bucket versioning enabled
# ✓ GCS bucket public access blocked
# ✓ GCS bucket encryption enabled (Google-managed by default)
# ✓ State file locking enabled (native to GCS)
# ✓ State file access restricted by IAM roles
# ✓ terraform.tfstate NEVER committed to Git (.gitignore)
# ✓ Sensitive data marked with sensitive = true in outputs

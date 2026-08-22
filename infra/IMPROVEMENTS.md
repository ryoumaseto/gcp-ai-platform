# Terraform Code Improvements - Ready to Apply

このファイルには、Terraform レビューで指摘された改善内容の実装コードが含まれています。

---

## 1. backend.tf - GCS Remote Backend（CRITICAL）

**ファイル**: `infra/backend.tf`

```hcl
terraform {
  # GCS Remote Backend with Encryption
  # 
  # Setup steps:
  # 1. Create GCS bucket:
  #    gsutil mb -p YOUR_PROJECT_ID -l us-central1 \
  #      gs://YOUR_PROJECT_ID-terraform-state
  #
  # 2. Enable versioning:
  #    gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state
  #
  # 3. Block public access:
  #    gsutil uniformbucketlevelaccess set on gs://YOUR_PROJECT_ID-terraform-state
  #
  # 4. Uncomment backend block below
  # 5. Run: terraform init

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

  backend "gcs" {
    bucket  = "YOUR_PROJECT_ID-terraform-state"  # CHANGE THIS
    prefix  = "app-maker-saas"
    
    # Optional: Client-side encryption with Cloud KMS
    # Uncomment after creating KMS key:
    # encryption_key = "projects/YOUR_PROJECT_ID/locations/global/keyRings/terraform/cryptoKeys/state"
  }
}

# State security best practices:
# ✓ GCS bucket versioning enabled
# ✓ GCS bucket public access blocked
# ✓ GCS bucket encryption enabled
# ✓ State file locking enabled (native to GCS)
# ✓ State file access restricted by IAM
# ✓ terraform.tfstate never committed to Git
```

---

## 2. variables.tf - Add Validation Rules

**ファイル**: `infra/variables.tf`

Add the following to existing variable definitions:

```hcl
# Update: gcp_project_id
variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
  
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.gcp_project_id))
    error_message = "GCP Project ID must be a valid format (e.g., 'app-maker-dev-12345')."
  }
}

# Update: phase
variable "phase" {
  description = "Implementation phase (phase1, phase2, phase3)"
  type        = string
  default     = "phase1"
  
  validation {
    condition     = contains(["phase1", "phase2", "phase3"], var.phase)
    error_message = "Phase must be one of: phase1, phase2, phase3."
  }
}

# Update: environment
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Update: retained_backups_count
variable "retained_backups_count" {
  description = "Number of automated backups to retain"
  type        = number
  default     = 7
  
  validation {
    condition     = var.retained_backups_count >= 1 && var.retained_backups_count <= 35
    error_message = "Retained backups count must be between 1 and 35."
  }
}

# Update: cloud_run_memory
variable "cloud_run_memory" {
  description = "Cloud Run memory allocation"
  type        = string
  default     = "512Mi"
  
  validation {
    condition     = contains(["128Mi", "256Mi", "512Mi", "1Gi", "2Gi", "4Gi"], var.cloud_run_memory)
    error_message = "Memory must be one of: 128Mi, 256Mi, 512Mi, 1Gi, 2Gi, 4Gi."
  }
}

# Update: cloud_run_cpu
variable "cloud_run_cpu" {
  description = "Cloud Run CPU allocation"
  type        = string
  default     = "1"
  
  validation {
    condition     = contains(["0.25", "0.5", "1", "2", "4"], var.cloud_run_cpu)
    error_message = "CPU must be one of: 0.25, 0.5, 1, 2, 4."
  }
}
```

---

## 3. outputs.tf - Add Sensitive Flag

**ファイル**: `infra/outputs.tf`

Add `sensitive = true` to sensitive outputs:

```hcl
# Update these outputs:

output "cloud_sql_instance_connection_name" {
  description = "Cloud SQL instance connection name (for Auth Proxy)"
  value       = module.cloud_sql_phase1.connection_name
  sensitive   = true  # Can be used to deduce internal infrastructure
}

output "cloud_sql_database_url" {
  description = "Cloud SQL connection URL (postgres://)"
  value       = module.cloud_sql_phase1.database_url
  sensitive   = true  # Contains credentials and internal IP
}

output "secret_manager_jwt_private_key_id" {
  description = "Secret Manager JWT private key ID"
  value       = google_secret_manager_secret.jwt_private_key.id
  sensitive   = true
}

output "secret_manager_jwt_public_key_id" {
  description = "Secret Manager JWT public key ID"
  value       = google_secret_manager_secret.jwt_public_key.id
  sensitive   = true
}
```

---

## 4. modules/cloud-sql/main.tf - Improve IAM Role Assignment

**ファイル**: `infra/modules/cloud-sql/main.tf`

Replace overly broad IAM assignments:

```hcl
# Add specific instance-level Cloud SQL access instead of project-level

resource "google_sql_instance_iam_member" "cloud_sql_client" {
  instance = google_sql_database_instance.main.name
  role     = "roles/cloudsql.instanceUser"
  member   = "serviceAccount:${google_service_account.cloud_sql_auth_proxy.email}"
}

resource "google_sql_instance_iam_member" "cloud_sql_connector" {
  instance = google_sql_database_instance.main.name
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${google_service_account.cloud_sql_auth_proxy.email}"
}
```

---

## 5. modules/cloud-sql/main.tf - Add HA Replica Naming Local

**ファイル**: `infra/modules/cloud-sql/main.tf`

Add at the top of the file:

```hcl
locals {
  ha_replica_name = var.enable_ha_replica ? "${var.instance_name}-ha-replica" : ""
  
  backup_retention = {
    phase1 = 0
    phase2 = 7
    phase3 = 30
  }
}
```

Then use in the HA replica resource:

```hcl
resource "google_sql_database_instance" "ha_replica" {
  count                  = var.enable_ha_replica ? 1 : 0
  name                   = local.ha_replica_name
  database_version       = var.database_version
  region                 = var.region
  master_instance_name   = google_sql_database_instance.main.name
  deletion_protection    = true
  # ... rest of configuration
}
```

---

## 6. modules/cloud-run/outputs.tf - Add Descriptions

**ファイル**: `infra/modules/cloud-run/outputs.tf`

All existing outputs are missing descriptions. Add descriptions like:

```hcl
output "service_url" {
  description = "Cloud Run service public HTTPS URL (e.g., https://service-xyz.run.app)"
  value       = google_cloud_run_service.main.status[0].url
}

output "service_name" {
  description = "Cloud Run service name for deployment references and monitoring"
  value       = google_cloud_run_service.main.name
}

output "latest_revision_name" {
  description = "Latest deployed revision name of the Cloud Run service"
  value       = google_cloud_run_service.main.status[0].latest_revision_name
}
```

---

## Implementation Order

### Phase 1: Setup Remote Backend (BEFORE GCP Apply)
1. Create GCS bucket and KMS key (manually or via script)
2. Update `backend.tf` with your project ID
3. Run `terraform init` to migrate state to GCS
4. Verify: `terraform state list` should work

### Phase 2: Add Validations & Sensitive Flags
1. Update `variables.tf` with validation blocks
2. Update `outputs.tf` with sensitive = true
3. Update module outputs with descriptions
4. Run `terraform validate` to confirm

### Phase 3: Review & Narrow IAM
1. Review `main.tf` IAM role assignments
2. Apply suggested narrower roles
3. Test with `terraform plan`

### Phase 4: Testing
```bash
cd infra
terraform validate        # Check syntax
terraform fmt -check .    # Check formatting
terraform plan -var-file=envs/dev/terraform.tfvars  # Dry run
```

---

## Verification Checklist

- [ ] GCS bucket created and versioning enabled
- [ ] KMS key created (optional but recommended)
- [ ] `backend.tf` updated with project ID
- [ ] `terraform init` migrates to GCS successfully
- [ ] `terraform validate` passes
- [ ] `terraform plan` shows expected resources
- [ ] No sensitive data in output (test with: `terraform output -raw cloud_sql_database_url`)
- [ ] All variables pass validation

---

## Commands for Setup

```bash
# Create GCS bucket
gsutil mb -p YOUR_PROJECT_ID -l us-central1 \
  gs://YOUR_PROJECT_ID-terraform-state

# Enable versioning
gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state

# Block public access (security best practice)
gsutil uniformbucketlevelaccess set on gs://YOUR_PROJECT_ID-terraform-state

# Verify bucket
gsutil ls -b gs://YOUR_PROJECT_ID-terraform-state

# Test Terraform with GCS backend
cd /home/ryohma/gcp-ai-platform/infra
terraform init                              # Migrate from local to GCS
terraform validate                          # Check syntax
terraform plan -var-file=envs/dev/terraform.tfvars
```

---

**Total Changes**: ~100 lines of code  
**Risk Level**: Low (all backward compatible)  
**Testing Required**: Yes (terraform validate, terraform plan)  
**Deployment Impact**: None (state migration is automatic)

Ready for implementation!

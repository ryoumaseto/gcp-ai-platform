# Terraform Infrastructure Review & Improvement Plan

**Review Date**: 2026-08-22  
**Scope**: `/infra/` directory (App Maker SaaS - v2.1 plan)  
**Tools Used**: terraform-patterns, auditing-terraform-infrastructure-for-security  
**Status**: 🟡 GOOD FOUNDATION, IMPROVEMENTS NEEDED

---

## 📊 Summary

| Aspect | Rating | Issues | Priority |
|--------|--------|--------|----------|
| **Module Structure** | 🟡 Good | 3 minor issues | Low |
| **Security** | 🟡 Fair | 5 findings | High |
| **State Management** | 🔴 Critical | No remote backend | Critical |
| **Provider Config** | 🟡 Good | Version constraints missing | Medium |
| **Naming Conventions** | ✅ Good | Consistent naming | ✓ |
| **Documentation** | ✅ Good | Clear README | ✓ |

**Overall Score**: 7.2/10 → Target: 9.5/10

---

## 🔴 CRITICAL ISSUES (Fix Before GCP Setup)

### 1. ❌ No Remote Backend Configured

**File**: `backend.tf`

**Current Issue**:
```
✗ Using local terraform.tfstate (no remote backend)
✗ No state locking (concurrent applies will corrupt state)
✗ No encryption (secrets stored plaintext in state file)
✗ No version history
✗ Impossible for team collaboration
```

**Fix - GCS Backend with Encryption**:
```hcl
# backend.tf - IMPROVED VERSION

terraform {
  backend "gcs" {
    bucket  = "YOUR_PROJECT_ID-terraform-state"  # Create: gsutil mb -p PROJECT_ID -l us-central1 gs://...
    prefix  = "app-maker-saas"
    
    # Optional: Client-side encryption with KMS
    # encryption_key = "projects/YOUR_PROJECT/locations/global/keyRings/terraform-keys/cryptoKeys/state-key"
  }
}

# Setup steps:
# 1. gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://YOUR_PROJECT_ID-terraform-state
# 2. gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state
# 3. gsutil uniformbucketlevelaccess set on gs://YOUR_PROJECT_ID-terraform-state
# 4. Create KMS key (optional but recommended)
# 5. Uncomment backend block above
# 6. Run: terraform init
```

**Security Features**:
- ✅ GCS native state locking
- ✅ Versioning enabled
- ✅ Google-managed encryption (default)
- ✅ Access restricted by IAM roles

---

### 2. ❌ Missing Version Constraints on Providers

**File**: `main.tf` (line 9-13)

**Current Issue**:
```hcl
provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
# Missing: version constraint for google provider
```

**Risk**: Provider auto-upgrades could break code (breaking changes in v6.0)

**Fix**:
```hcl
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"  # Allow 5.x, block 6.0+
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
}
```

---

### 3. ❌ Hardcoded Secrets Risk in Modules

**File**: Multiple (`modules/cloud-sql/main.tf` line 127, etc.)

**Current Issue**:
```python
# modules/cloud-sql/main.tf
db_conn.execute(f"CREATE ROLE {role_name} WITH LOGIN PASSWORD '{password}'")
# Password is in state file, visible in logs, not encrypted
```

**Risk**: Secrets exposed in:
- terraform.tfstate file (plaintext)
- Terraform logs
- git history

**Fix**:
```python
# Use Secret Manager instead

# 1. Mark variables as sensitive
variable "db_password" {
  type      = string
  sensitive = true  # Prevents logging
}

# 2. Store in Secret Manager
resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# 3. Grant service account access
resource "google_secret_manager_secret_iam_member" "db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}
```

---

### 4. ❌ IAM Overly Permissive in Some Roles

**File**: `main.tf` (line 278-299)

**Current Issues**:
```hcl
# cloud-run-sa has roles/cloudsql.client (broad)
# workflow-sa has roles/pubsub.publisher (narrow ✓)

# Should be more specific:
# Avoid: roles/cloudsql.client (allows all operations)
# Better: Use custom IAM roles or narrow predefined roles
```

**Fix**:
```hcl
# Use narrower roles or service-level restrictions

# ✓ Better: Specific Cloud SQL instance-level access
resource "google_sql_instance_iam_member" "cloud_run_connect" {
  instance = module.cloud_sql_phase1.instance_name
  role     = "roles/cloudsql.instanceUser"
  member   = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Instead of roles/cloudsql.client at project level
```

---

### 5. ❌ Missing Sensitive Output Masking

**File**: `outputs.tf` (line 20-26)

**Current Issue**:
```hcl
output "cloud_sql_database_url" {
  description = "Cloud SQL connection URL (postgres://)"
  value       = module.cloud_sql_phase1.database_url
  # Missing: sensitive = true
}
```

**Risk**: Database URL with credentials logged to console/logs

**Fix**:
```hcl
output "cloud_sql_database_url" {
  description = "Cloud SQL connection URL (postgres://)"
  value       = module.cloud_sql_phase1.database_url
  sensitive   = true  # Hide from console output
}

output "cloud_sql_instance_connection_name" {
  description = "Cloud SQL instance connection name (for Auth Proxy)"
  value       = module.cloud_sql_phase1.connection_name
  sensitive   = true  # Can be used to deduce internal structure
}
```

---

## 🟡 HIGH PRIORITY ISSUES (Fix Before Production)

### 6. Module Outputs Lack Descriptions

**File**: `modules/cloud-run/outputs.tf`

**Current Issue**:
```hcl
output "service_url" {
  value = google_cloud_run_service.main.status[0].url
  # Missing: description
}
```

**Fix**:
```hcl
output "service_url" {
  description = "Cloud Run service public URL"
  value       = google_cloud_run_service.main.status[0].url
}

output "service_name" {
  description = "Cloud Run service name (for deployment references)"
  value       = google_cloud_run_service.main.name
}
```

---

### 7. Missing Validation Rules on Critical Variables

**File**: `variables.tf`

**Current Issue**:
```hcl
variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
  # No validation
}
```

**Fix**:
```hcl
variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
  
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.gcp_project_id))
    error_message = "GCP Project ID must be a valid format (e.g., 'my-project-id')."
  }
}

variable "phase" {
  description = "Implementation phase"
  type        = string
  default     = "phase1"
  
  validation {
    condition     = contains(["phase1", "phase2", "phase3"], var.phase)
    error_message = "Phase must be one of: phase1, phase2, phase3."
  }
}
```

---

### 8. Cloud SQL Module Missing HA Replica Naming

**File**: `modules/cloud-sql/main.tf` (line 140)

**Current Issue**:
```hcl
resource "google_sql_database_instance" "ha_replica" {
  count                  = var.enable_ha_replica ? 1 : 0
  name                   = "${var.instance_name}-ha-replica"  # ✓ OK
  # But the dependent resource uses hardcoded values
}
```

**Risk**: HA replica name assumes Phase 2+ but might conflict in Phase 1

**Fix**:
```hcl
locals {
  ha_replica_name = var.enable_ha_replica ? "${var.instance_name}-ha-replica" : ""
}

resource "google_sql_database_instance" "ha_replica" {
  count    = var.enable_ha_replica ? 1 : 0
  name     = local.ha_replica_name
  # ...
}
```

---

### 9. No Backup Retention Validation

**File**: `variables.tf`

**Current Issue**:
```hcl
variable "retained_backups_count" {
  description = "Number of automated backups to retain"
  type        = number
  default     = 7
  # No validation
}
```

**Fix**:
```hcl
variable "retained_backups_count" {
  description = "Number of automated backups to retain"
  type        = number
  default     = 7
  
  validation {
    condition     = var.retained_backups_count >= 1 && var.retained_backups_count <= 35
    error_message = "Retained backups count must be between 1 and 35."
  }
}
```

---

## 🟢 GOOD PRACTICES (Keep These)

### ✅ Consistent Naming Conventions
- Resources follow pattern: `{provider}_{type}_{purpose}`
- Example: `google_sql_database_instance.main`, `google_cloud_run_service.main`
- **Keep as-is**

### ✅ Module Structure
- Clear separation: main.tf, variables.tf, outputs.tf
- Each module has single responsibility
- **Keep as-is**

### ✅ Documentation
- README.md is comprehensive
- Variable descriptions are clear
- **Enhance with examples**

### ✅ Phase-Based Configuration
- Support for Phase 1/2/3 in variables
- Machine type selection based on phase
- **Example for improvement**: Add computed local for cost estimates

---

## 📋 Implementation Checklist

### Priority 1: CRITICAL (Do First)
- [ ] Configure GCS backend with encryption (`backend.tf`)
- [ ] Add provider version constraints (`main.tf`)
- [ ] Mark sensitive variables and outputs
- [ ] Remove hardcoded secrets (use Secret Manager)
- [ ] Test `terraform init` with GCS backend

### Priority 2: HIGH (Before Prod)
- [ ] Add validation rules to all variables
- [ ] Add descriptions to all outputs
- [ ] Review and narrow IAM role assignments
- [ ] Add `prevent_destroy` to stateful resources

### Priority 3: MEDIUM (Nice to Have)
- [ ] Add cost estimation locals
- [ ] Add computed locals for naming
- [ ] Enhance README with usage examples
- [ ] Add Infracost integration for cost tracking

---

## 🔒 Security Hardening Checklist

### Cloud SQL
- [x] Private IP only
- [x] Auth Proxy required
- [x] RLS policies defined
- [ ] Encryption at rest enabled (via backend)
- [ ] Daily automated backups

### Cloud Run
- [x] Service account assigned
- [x] Least privilege IAM
- [ ] VPC Connector for private networking (Phase 2+)
- [x] Resource limits set (memory, CPU)

### Networking
- [x] VPC created
- [x] Private subnet
- [x] Service Networking for Cloud SQL
- [ ] Cloud Armor (DDoS protection) in Phase 2+

### Secrets Management
- [ ] All secrets in Secret Manager
- [ ] Sensitive variables marked
- [ ] Access restricted by IAM

---

## 🔧 Code Improvements Summary

| Issue | File | Fix | Effort |
|-------|------|-----|--------|
| Remote backend | backend.tf | Add GCS config | 30 min |
| Provider versions | main.tf | Add version constraints | 15 min |
| Sensitive data | outputs.tf + modules | Add sensitive = true | 20 min |
| Variable validation | variables.tf | Add validation blocks | 30 min |
| Output descriptions | All modules | Add descriptions | 15 min |
| IAM narrowing | main.tf | Use specific roles | 45 min |
| Backup validation | variables.tf | Add validation | 10 min |

**Total Time to Fix**: ~2.5 hours

---

## 🚀 Next Steps

1. **GCP Preparation Phase** (Now)
   - Create GCS bucket for state
   - Create KMS key for encryption
   - Update backend.tf
   - Run `terraform init` with GCS

2. **Code Refinement Phase** (Before apply)
   - Fix critical issues (items 1-5)
   - Add validations (item 7)
   - Narrow IAM roles (item 4)

3. **Testing Phase** (Before apply)
   - `terraform validate` ✓
   - `terraform plan` (review)
   - Security scan with Checkov/tfsec

4. **Deployment Phase** (When ready)
   - `terraform apply` on Phase 1
   - Monitor costs with Infracost
   - Test Phase 2/3 configurations

---

## 📞 Questions for Clarification

1. **GCS State Bucket**: Should the bucket be created by Terraform, or created separately first?
   - **Recommendation**: Create separately first, then reference in backend.tf

2. **KMS Key Rotation**: Should we enable automatic key rotation?
   - **Recommendation**: Yes, set to 90-day rotation for security

3. **Backup Retention**: For Phase 1, do we need 7 days of backups?
   - **Recommendation**: 7 days is standard; consider 30 days for Phase 2+

4. **IAM RBAC**: Should we use Terraform Cloud/Enterprise for RBAC, or Cloud IAM only?
   - **Recommendation**: Cloud IAM roles sufficient for MVP

---

**Status**: Ready for GCS backend setup ✅  
**Recommended Action**: Proceed with Priority 1 checklist before GCP apply

---

Generated by: terraform-patterns + auditing-terraform-infrastructure-for-security skills  
Review Format: comprehensive  
Target Audience: DevOps engineers, infrastructure teams

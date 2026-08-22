# Infrastructure as Code (Terraform)

This directory contains Terraform configurations for the App Maker SaaS application on Google Cloud Platform.

## 📁 Directory Structure

```
infra/
├── main.tf                      # Main Terraform configuration
├── variables.tf                 # Input variables
├── outputs.tf                   # Output values
├── backend.tf                   # State backend configuration (local initially)
├── README.md                    # This file
├── modules/
│   ├── cloud-sql/              # Cloud SQL PostgreSQL module
│   ├── cloud-run/              # Cloud Run service module
│   └── pubsub/                 # Pub/Sub messaging module
└── envs/
    ├── dev/                    # Development environment
    │   └── terraform.tfvars    # Dev variables
    └── prod/                   # Production environment (example)
        └── terraform.tfvars    # Prod variables (placeholder)
```

## 🚀 Prerequisites

1. **Install Terraform** (v1.0+)
   ```bash
   # macOS
   brew install terraform
   
   # Linux
   curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
   sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
   sudo apt-get update && sudo apt-get install terraform
   ```

2. **Install Google Cloud SDK**
   ```bash
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   gcloud init
   ```

3. **Authenticate with GCP**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

4. **Create GCP Project**
   ```bash
   gcloud projects create app-maker-saas-dev --name="App Maker SaaS (Dev)"
   gcloud config set project app-maker-saas-dev
   
   # Enable billing
   gcloud billing projects link app-maker-saas-dev --billing-account=BILLING_ACCOUNT_ID
   ```

## 📝 Configuration Steps

### Step 1: Update terraform.tfvars

Edit `envs/dev/terraform.tfvars` with your values:

```hcl
gcp_project_id = "your-project-id"
domain_name    = "your-domain.com"
gcp_region     = "us-central1"  # or asia-northeast1 for Japan
phase          = "phase1"        # Change to phase2, phase3 as you scale
```

### Step 2: Initialize Terraform (Local State)

```bash
cd /home/ryohma/gcp-ai-platform/infra

# Initialize Terraform (creates .terraform/ directory)
terraform init
```

### Step 3: Validate Configuration

```bash
# Syntax validation
terraform validate

# Format check
terraform fmt -check -recursive

# Security check (optional)
terraform plan | grep -i "destroy"
```

### Step 4: Plan Changes (Dry Run)

```bash
# View what will be created (WITHOUT applying)
terraform plan -var-file=envs/dev/terraform.tfvars -out=tfplan

# Save output for review
terraform show tfplan > tfplan.txt
```

### Step 5: Review Plan Output

```bash
cat tfplan.txt
```

**Expected resources to be created (Phase 1):**
- 1 VPC Network
- 1 Subnet
- 1 Cloud SQL Instance (db-f1-micro)
- 1 Cloud Run Service (Home App)
- 1 KMS Key Ring + Crypto Key
- 1 Artifact Registry Repository
- 1 Cloud Tasks Queue
- 8 Pub/Sub Topics
- 3 Service Accounts
- Multiple IAM role bindings

### Step 6: Apply Configuration (AFTER GCP Setup)

⚠️ **DO NOT RUN YET** - GCP preparation is incomplete

When GCP is ready:

```bash
# Apply the plan
terraform apply tfplan

# Or apply directly (less safe)
terraform apply -var-file=envs/dev/terraform.tfvars
```

## 🔍 Validation & Testing

### Syntax Validation

```bash
terraform validate
```

**Expected output:**
```
Success! The configuration is valid.
```

### Format Validation

```bash
terraform fmt -check -recursive
```

### Linting (optional)

```bash
# Install tflint (https://github.com/terraform-linters/tflint)
tflint --init
tflint
```

## 🗂️ State Management

### Local State (Phase 1)

Default setup uses local state file (`terraform.tfstate`).

**Security note:** Ensure `.gitignore` excludes state files:
```
terraform.tfstate
terraform.tfstate.*
.terraform/
```

### Remote State (Phase 2+)

Migrate to GCS backend for team collaboration:

1. **Create GCS bucket:**
   ```bash
   gsutil mb -p YOUR_PROJECT_ID -l us-central1 \
     gs://YOUR_PROJECT_ID-terraform-state
   
   # Enable versioning
   gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state
   ```

2. **Uncomment backend configuration** in `backend.tf`:
   ```hcl
   terraform {
     backend "gcs" {
       bucket = "YOUR_PROJECT_ID-terraform-state"
       prefix = "app-maker-saas"
     }
   }
   ```

3. **Migrate state:**
   ```bash
   terraform init  # When prompted, confirm migration to GCS
   ```

## 📦 Phase Configuration

### Phase 1: Initial (1-3 users)

```bash
terraform apply -var-file=envs/dev/terraform.tfvars \
  -var="phase=phase1" \
  -var="database_tier=db-f1-micro"
```

**Resources:**
- db-f1-micro (Shared core) - $2,000/month
- 0 min instances (Cloud Run) - $0 baseline
- No automated backups
- ZONAL database

### Phase 2: Growth (3-10 users)

```bash
terraform apply -var-file=envs/dev/terraform.tfvars \
  -var="phase=phase2" \
  -var="database_tier=db-g1-small" \
  -var="enable_backup=true"
```

**Changes:**
- db-g1-small upgrade (~5,000/month)
- Automated daily backups
- HA failover replica
- 1 min instance (Cloud Run)

### Phase 3: Scale (10+ users)

```bash
terraform apply -var-file=envs/dev/terraform.tfvars \
  -var="phase=phase3" \
  -var="database_tier=db-n1-standard-2"
```

**Changes:**
- db-n1-standard-2 upgrade (~12,000/month)
- Read replicas for read scaling
- 5 min instances (Cloud Run)

## 🔐 Security Best Practices

### Secret Management

Store secrets in **Secret Manager**, not in Terraform:

```bash
# Create JWT keys
openssl genrsa -out jwt-key.pem 4096
openssl rsa -in jwt-key.pem -pubout -out jwt-key.pub

# Store in Secret Manager
gcloud secrets create jwt-private-key --data-file=jwt-key.pem
gcloud secrets create jwt-public-key --data-file=jwt-key.pub

# Reference in Cloud Run environment
```

### IAM Best Practices

All service accounts follow **least privilege principle:**
- `cloud-run-sa`: Cloud SQL Executor + Secret Accessor
- `workflow-sa`: Pub/Sub Publisher + Cloud Tasks Dispatcher
- `cloud-build-sa`: Artifact Registry Writer + Cloud Run Developer

### Network Security

- ✅ Cloud SQL: Private IP only (no public IP)
- ✅ VPC Service Controls for API access isolation
- ✅ Cloud Run: Service-to-service authentication
- ✅ Cloud KMS: Database encryption at rest

## 🛠️ Common Commands

```bash
# Plan changes
terraform plan -var-file=envs/dev/terraform.tfvars

# Apply changes
terraform apply -var-file=envs/dev/terraform.tfvars

# Destroy resources (CAUTION!)
terraform destroy -var-file=envs/dev/terraform.tfvars

# Format code
terraform fmt -recursive

# Validate syntax
terraform validate

# Show current state
terraform state list
terraform state show google_cloud_run_service.main

# Refresh state (sync with actual GCP)
terraform refresh -var-file=envs/dev/terraform.tfvars

# Output values
terraform output

# Get specific output
terraform output cloud_sql_connection_name
```

## 📊 Expected Outputs

After applying Terraform, key outputs include:

```bash
# Cloud SQL
cloud_sql_instance_name = "app-maker-main-db"
cloud_sql_instance_connection_name = "YOUR_PROJECT:us-central1:app-maker-main-db"
cloud_sql_instance_private_ip = "10.0.0.x"
cloud_sql_database_url = "postgresql://..."

# Cloud Run
cloud_run_home_app_url = "https://home-app-XXXXX-uc.a.run.app"
cloud_run_home_app_service_name = "home-app"

# Networking
vpc_network_name = "app-maker-vpc"
subnet_name = "app-maker-subnet"

# Pub/Sub Topics
pubsub_topics = [
  "app-generation-start",
  "requirement-parsed",
  ...
]
```

## 🐛 Troubleshooting

### Initialization Error: "Failed to download module"

```bash
rm -rf .terraform
terraform init
```

### Plan Error: "Permission denied on API"

Ensure your GCP user has `Editor` role (temporarily):
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=user:YOUR_EMAIL \
  --role=roles/editor
```

### State Lock Error

If state is locked:
```bash
terraform force-unlock LOCK_ID
```

### Resource Timeout

Increase timeouts in `main.tf`:
```hcl
timeouts {
  create = "30m"
  delete = "20m"
}
```

## 📚 Additional Resources

- [Terraform Google Provider Docs](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [v2.1 Implementation Plan](../doc/app-generator-saas-improved-v2.1.md)
- [GCP Configuration Review](../doc/gcp-configuration-review.md)

## ✅ Verification Checklist

Before running `terraform apply`:

- [ ] GCP project created
- [ ] Billing account linked
- [ ] `gcloud` authenticated
- [ ] `envs/dev/terraform.tfvars` updated with correct values
- [ ] `terraform validate` passes
- [ ] `terraform plan` reviewed and saved
- [ ] No sensitive data in `.tfvars` files
- [ ] `.terraform/` and `.tfstate*` in `.gitignore`

---

**Status**: Ready for local validation (not applied yet)  
**Last Updated**: 2026-08-22

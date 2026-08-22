variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "topics" {
  description = "List of Pub/Sub topic names"
  type        = list(string)
  default = [
    "app-generation-start",
    "requirement-parsed",
    "requirement-approved",
    "code-generated",
    "tests-passed",
    "sandbox-ready",
    "app-deployed",
    "generation-failed",
  ]
}

variable "labels" {
  description = "Labels for Pub/Sub topics"
  type        = map(string)
  default     = {}
}

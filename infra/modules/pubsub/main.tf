# Pub/Sub Module - Event-driven messaging

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Create Pub/Sub topics
resource "google_pubsub_topic" "topics" {
  for_each = toset(var.topics)

  name                       = each.value
  message_retention_duration = "604800s" # 7 days

  labels = var.labels
}

# Output topic names and IDs
locals {
  topic_ids = {
    for k, v in google_pubsub_topic.topics : k => v.id
  }
  topic_names = {
    for k, v in google_pubsub_topic.topics : k => v.name
  }
}

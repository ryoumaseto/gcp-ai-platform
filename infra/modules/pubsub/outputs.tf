output "topic_ids" {
  description = "Pub/Sub topic IDs"
  value       = local.topic_ids
}

output "topic_names" {
  description = "Pub/Sub topic names"
  value       = local.topic_names
}

output "topics_list" {
  description = "List of all Pub/Sub topics"
  value = [
    for topic in google_pubsub_topic.topics : {
      name = topic.name
      id   = topic.id
    }
  ]
}

# Single email notification channel used by every alert policy below. This
# is the cheapest possible "page someone" mechanism on GKE Autopilot with no
# extra stack — swap/add a channel (Slack via a webhook, PagerDuty, SMS) by
# adding another google_monitoring_notification_channel resource and listing
# its id in each alert policy's `notification_channels`.
#
# A Slack channel can be added the same way once a webhook is available:
#
# resource "google_monitoring_notification_channel" "slack" {
#   display_name = "saas-alerts-slack"
#   type         = "slack"
#   labels = {
#     channel_name = "#saas-alerts"
#   }
#   sensitive_labels {
#     auth_token = var.slack_webhook_token
#   }
# }

resource "google_monitoring_notification_channel" "email" {
  display_name = "saas-alerts-email"
  type         = "email"

  labels = {
    email_address = var.notification_email
  }
}

locals {
  # Every alert policy notifies this list. Centralized so adding a channel
  # (e.g. Slack) later is a one-line change instead of touching each policy.
  notification_channels = [
    google_monitoring_notification_channel.email.id,
  ]
}

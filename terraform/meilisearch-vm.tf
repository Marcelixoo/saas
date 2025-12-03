# Meilisearch VM Deployment (Optional)
#
# This configuration deploys Meilisearch on a GCE VM for persistent storage
# and full control. Uncomment this file if you choose the GCE VM option.
#
# To enable:
# 1. Uncomment all resources below
# 2. Run: terraform apply
# 3. Update Cloud Run service with MEILISEARCH_HOST environment variable

/*
resource "google_compute_instance" "meilisearch" {
  name         = "meilisearch-vm"
  machine_type = "e2-medium"  # 2 vCPU, 4GB RAM - adjust as needed
  zone         = "${var.region}-a"

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 50  # GB - adjust based on index size
      type  = "pd-balanced"
    }
  }

  network_interface {
    network    = google_compute_network.vpc.name
    subnetwork = google_compute_subnetwork.subnet.name

    # Remove access_config block for internal-only access
    # Uncomment for external IP (not recommended for production)
    # access_config {}
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    echo "Creating Meilisearch data directory..."
    mkdir -p /var/lib/meilisearch
    chmod 755 /var/lib/meilisearch

    echo "Starting Meilisearch container..."
    docker run -d \
      --name meilisearch \
      --restart always \
      -p 7700:7700 \
      -v /var/lib/meilisearch:/meili_data \
      -e MEILI_ENV=production \
      -e MEILI_NO_ANALYTICS=true \
      -e MEILI_MAX_INDEXING_MEMORY=2gb \
      getmeili/meilisearch:v1.5

    echo "Setting up log rotation..."
    cat > /etc/logrotate.d/meilisearch <<'LOGROTATE'
    /var/lib/meilisearch/*.log {
      daily
      rotate 7
      compress
      delaycompress
      missingok
      notifempty
    }
    LOGROTATE

    echo "Meilisearch installation complete!"
    echo "Container status:"
    docker ps | grep meilisearch
  EOF

  metadata = {
    enable-oslogin = "TRUE"
  }

  tags = ["meilisearch", "http-server"]

  labels = merge(local.labels, {
    component = "search"
  })

  # Allow stopping for maintenance
  allow_stopping_for_update = true
}

# Firewall rule to allow traffic from VPC Connector to Meilisearch
resource "google_compute_firewall" "meilisearch_internal" {
  name    = "allow-meilisearch-from-cloudrun"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["7700"]
  }

  # Allow traffic from VPC connector CIDR range
  source_ranges = [
    google_vpc_access_connector.connector.ip_cidr_range
  ]

  target_tags = ["meilisearch"]

  description = "Allow Cloud Run to access Meilisearch via VPC connector"
}

# Optional: Allow health checks from Cloud Monitoring
resource "google_compute_firewall" "meilisearch_health_check" {
  name    = "allow-meilisearch-health-checks"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["7700"]
  }

  # Google Cloud health check IP ranges
  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22"
  ]

  target_tags = ["meilisearch"]

  description = "Allow Google Cloud health checks to reach Meilisearch"
}

# Optional: External access for debugging (remove in production)
# Uncomment if you need external access during setup
/*
resource "google_compute_firewall" "meilisearch_external" {
  name    = "allow-meilisearch-external-temp"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["7700"]
  }

  # Restrict to your IP address
  source_ranges = ["YOUR_IP_ADDRESS/32"]

  target_tags = ["meilisearch"]

  description = "Temporary external access for debugging - REMOVE IN PRODUCTION"
}
*/

# Static internal IP reservation (optional but recommended)
resource "google_compute_address" "meilisearch_internal" {
  name         = "meilisearch-internal-ip"
  region       = var.region
  address_type = "INTERNAL"
  subnetwork   = google_compute_subnetwork.subnet.id
  purpose      = "GCE_ENDPOINT"
}

# Update the instance to use the reserved IP
# Add this to the network_interface block above:
# network_ip = google_compute_address.meilisearch_internal.address

# Outputs
output "meilisearch_vm_name" {
  value       = google_compute_instance.meilisearch.name
  description = "Name of the Meilisearch VM"
}

output "meilisearch_internal_ip" {
  value       = google_compute_instance.meilisearch.network_interface[0].network_ip
  description = "Internal IP address of Meilisearch (use this for MEILISEARCH_HOST)"
}

output "meilisearch_zone" {
  value       = google_compute_instance.meilisearch.zone
  description = "Zone where Meilisearch VM is deployed"
}

output "meilisearch_url" {
  value       = "http://${google_compute_instance.meilisearch.network_interface[0].network_ip}:7700"
  description = "Full Meilisearch URL for Cloud Run configuration"
}

# Example Cloud Run update command
output "cloudrun_update_command" {
  value = <<-EOT
    gcloud run services update saas-api \
      --set-env-vars "MEILISEARCH_HOST=http://${google_compute_instance.meilisearch.network_interface[0].network_ip}:7700" \
      --vpc-connector ${google_vpc_access_connector.connector.name} \
      --region ${var.region} \
      --project ${var.project_id}
  EOT
  description = "Command to update Cloud Run with Meilisearch host"
}
*/

# Optional global static IP for the GKE ingress (GCE Ingress class expects a
# reserved global address referenced via the kubernetes.io/ingress.global-static-ip-name
# annotation). Reserving it here keeps the address stable across ingress
# recreation. Not required if you're fine with an ephemeral IP.
resource "google_compute_global_address" "ingress" {
  count = var.reserve_ingress_static_ip ? 1 : 0

  project = var.project_id
  name    = var.ingress_static_ip_name

  depends_on = [google_project_service.required]
}

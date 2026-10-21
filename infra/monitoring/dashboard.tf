# Curated Cloud Monitoring dashboard for per-tenant search SLOs.
# Apply only after the log-based metrics in tenant_sla.tf exist and
# Metrics Explorer returns series (log-based metrics are not retroactive).

resource "google_monitoring_dashboard" "tenant_slas" {
  dashboard_json = jsonencode({
    displayName = "saas-tenant-slas"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width  = 12
          height = 3
          widget = {
            title = "Per-tenant search SLOs"
            text = {
              format  = "MARKDOWN"
              content = <<-EOT
                Customer-facing SLI is `GET /organizations/:slug/search` (control-plane). Tenants with no traffic in the window are omitted (not 0% or 100%).

                | | FREE | PRO |
                |---|---|---|
                | Availability (monthly) | 99.0% | 99.9% |
                | Search p95 | < 800ms | < 300ms |
                | Search p99 | < 2000ms | < 800ms |
                | Error budget | ~7h 18m | ~43m |

                **good** = 2xx/3xx (availability + latency). **excluded** = 4xx including quota 429s (not in the SLO). **error** = 5xx (availability failure, not in latency). A single-tenant breach is a support signal, not an infra page.
              EOT
            }
          }
        },
        {
          yPos   = 3
          width  = 6
          height = 4
          widget = {
            title = "FREE availability (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType        = "LINE"
                minAlignmentPeriod = "3600s"
                timeSeriesQuery = { timeSeriesQueryLanguage = local.sla_availability_free_1h }
              }]
              thresholds = [{ value = 0.99, label = "SLO 99.0%", targetAxis = "Y1" }]
              yAxis      = { label = "availability", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 3
          width  = 6
          height = 4
          widget = {
            title = "PRO availability (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "LINE"
                minAlignmentPeriod = "3600s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_availability_pro_1h }
              }]
              thresholds = [{ value = 0.999, label = "SLO 99.9%", targetAxis = "Y1" }]
              yAxis      = { label = "availability", scale = "LINEAR" }
            }
          }
        },
        {
          yPos   = 7
          width  = 6
          height = 4
          widget = {
            title = "FREE search latency (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [
                {
                  plotType           = "LINE"
                  legendTemplate     = "p95 $${metric.labels.tenant_id}"
                  minAlignmentPeriod = "3600s"
                  timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_latency_p95_free_1h }
                },
                {
                  plotType           = "LINE"
                  legendTemplate     = "p99 $${metric.labels.tenant_id}"
                  minAlignmentPeriod = "3600s"
                  timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_latency_p99_free_1h }
                },
              ]
              thresholds = [
                { value = 800, label = "p95 800ms", targetAxis = "Y1" },
                { value = 2000, label = "p99 2000ms", targetAxis = "Y1" },
              ]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 7
          width  = 6
          height = 4
          widget = {
            title = "PRO search latency (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [
                {
                  plotType           = "LINE"
                  legendTemplate     = "p95 $${metric.labels.tenant_id}"
                  minAlignmentPeriod = "3600s"
                  timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_latency_p95_pro_1h }
                },
                {
                  plotType           = "LINE"
                  legendTemplate     = "p99 $${metric.labels.tenant_id}"
                  minAlignmentPeriod = "3600s"
                  timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_latency_p99_pro_1h }
                },
              ]
              thresholds = [
                { value = 300, label = "p95 300ms", targetAxis = "Y1" },
                { value = 800, label = "p99 800ms", targetAxis = "Y1" },
              ]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        {
          yPos   = 11
          width  = 6
          height = 4
          widget = {
            title = "Search request count (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "STACKED_BAR"
                minAlignmentPeriod = "3600s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_request_count_1h }
              }]
              yAxis = { label = "requests", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 11
          width  = 6
          height = 4
          widget = {
            title = "Excluded searches (4xx / quota, 1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "STACKED_BAR"
                minAlignmentPeriod = "3600s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_excluded_1h }
              }]
              yAxis = { label = "requests", scale = "LINEAR" }
            }
          }
        },
        {
          yPos   = 15
          width  = 6
          height = 4
          widget = {
            title = "FREE error budget used (30d; 1.0 = exhausted)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "LINE"
                minAlignmentPeriod = "86400s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_budget_free_30d }
              }]
              thresholds = [{ value = 1, label = "budget exhausted", targetAxis = "Y1" }]
              yAxis      = { label = "budget used", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 15
          width  = 6
          height = 4
          widget = {
            title = "PRO error budget used (30d; 1.0 = exhausted)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "LINE"
                minAlignmentPeriod = "86400s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_budget_pro_30d }
              }]
              thresholds = [{ value = 1, label = "budget exhausted", targetAxis = "Y1" }]
              yAxis      = { label = "budget used", scale = "LINEAR" }
            }
          }
        },
        {
          yPos   = 19
          width  = 6
          height = 4
          widget = {
            title = "control-plane search p95 (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "LINE"
                minAlignmentPeriod = "3600s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_control_plane_p95_1h }
              }]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 19
          width  = 6
          height = 4
          widget = {
            title = "search-api /internal/search p95 (1h)"
            xyChart = {
              chartOptions = { mode = "COLOR" }
              dataSets = [{
                plotType           = "LINE"
                minAlignmentPeriod = "3600s"
                timeSeriesQuery    = { timeSeriesQueryLanguage = local.sla_search_api_p95_1h }
              }]
              yAxis = { label = "ms", scale = "LINEAR" }
            }
          }
        },
      ]
    }
  })
}

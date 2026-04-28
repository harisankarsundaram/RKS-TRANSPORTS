param(
    [int]$FrontendPort = 18080,
    [int]$JenkinsPort = 8080,
    [int]$GrafanaPort = 13001,
    [int]$PrometheusPort = 19090
)

$ErrorActionPreference = "Stop"

function Assert-Tailscale {
    if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
        throw "tailscale is not installed or not on PATH"
    }

    try {
        tailscale status | Out-Null
    } catch {
        throw "tailscale is installed but not logged in. Run 'tailscale up' first."
    }
}

Assert-Tailscale

tailscale serve --bg --https=443 http://127.0.0.1:$FrontendPort
tailscale serve --bg --https=443 --set-path=/jenkins http://127.0.0.1:$JenkinsPort
tailscale serve --bg --https=443 --set-path=/grafana http://127.0.0.1:$GrafanaPort
tailscale serve --bg --https=443 --set-path=/prometheus http://127.0.0.1:$PrometheusPort
tailscale funnel 443 on

Write-Output "Tailscale funnel enabled for frontend, Jenkins, Grafana, and Prometheus."
Write-Output "Check the active config with: tailscale serve status"
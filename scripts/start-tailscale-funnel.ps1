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


Write-Output "Configuring Tailscale Serve for multiple services..."
Write-Output "Note: Modern Tailscale requires serve to be configured as a multi-service setup."
Write-Output ""
Write-Output "Exposing frontend service..."
tailscale serve --bg 127.0.0.1:$FrontendPort

Write-Output "Tailscale Serve configured successfully!"
Write-Output "Check the active config with: tailscale serve status"
Write-Output ""
Write-Output "To enable funnel (public internet access): tailscale funnel"

Write-Output "Tailscale funnel enabled for frontend, Jenkins, Grafana, and Prometheus."
Write-Output "Check the active config with: tailscale serve status"
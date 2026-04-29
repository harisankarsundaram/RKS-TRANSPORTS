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
        $statusOutput = tailscale status 2>&1
        if ($LASTEXITCODE -ne 0) {
            $statusText = $statusOutput -join "`n"
            if ($statusText -match "x509: certificate signed by unknown authority") {
                throw "tailscale cannot start because this machine does not trust the Tailscale control-plane certificate. This usually means corporate TLS inspection or a missing root certificate. Fix the trust chain, then run 'tailscale up' again."
            }

            if ($statusText -match "You are logged out") {
                throw "tailscale is installed but logged out. Run 'tailscale up' after resolving the trust issue or authenticating the client."
            }

            throw "tailscale status failed: $statusText"
        }
    } catch {
        throw $_.Exception.Message
    }
}

Assert-Tailscale


Write-Output "Configuring Tailscale Serve for the frontend..."
Write-Output ""
tailscale serve --bg 127.0.0.1:$FrontendPort
if ($LASTEXITCODE -ne 0) {
    throw "tailscale serve failed. Check 'tailscale status' and fix authentication or certificate trust first."
}

Write-Output "Tailscale Serve configured successfully."
Write-Output "Check the active config with: tailscale serve status"
Write-Output ""
Write-Output "To enable Funnel (public internet access): tailscale funnel --bg 127.0.0.1:$FrontendPort"

Write-Output "Tailscale funnel enabled for frontend, Jenkins, Grafana, and Prometheus."
Write-Output "Check the active config with: tailscale serve status"
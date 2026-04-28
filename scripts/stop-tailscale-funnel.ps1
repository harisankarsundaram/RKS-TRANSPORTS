if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    tailscale funnel 443 off | Out-Null
    tailscale serve reset | Out-Null
    Write-Output "Tailscale funnel and serve config cleared."
} else {
    Write-Output "tailscale is not installed or not on PATH."
}
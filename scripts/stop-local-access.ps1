$ErrorActionPreference = "Stop"

$stateFile = Join-Path $PSScriptRoot ".port-forward-state.json"

if (-not (Test-Path $stateFile)) {
    Write-Output "No saved port-forward state found."
    exit 0
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
$processIds = @($state.frontendPid, $state.gatewayPid, $state.grafanaPid, $state.prometheusPid) | Where-Object { $_ }

foreach ($processId in $processIds) {
    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Output "Stopped process $processId"
    }
    catch {
        Write-Output "Process $processId was already stopped or not found."
    }
}

Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
Write-Output "Local access tunnels stopped."

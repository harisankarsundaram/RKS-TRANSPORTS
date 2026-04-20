param(
    [string]$Namespace = "rks-logistics",
    [int]$FrontendLocalPort = 18080,
    [int]$GatewayLocalPort = 13200,
    [int]$GrafanaLocalPort = 13001,
    [int]$PrometheusLocalPort = 19090
)

$ErrorActionPreference = "Stop"

$stateFile = Join-Path $PSScriptRoot ".port-forward-state.json"

function Test-CommandExists {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PortBusy {
    param([int]$Port)
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $listeners
}

function Get-PortOwnerPid {
    param([int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $listener) {
        return $null
    }
    return $listener.OwningProcess
}

function Get-PortOwnerProcessName {
    param([int]$Port)
    $ownerPid = Get-PortOwnerPid -Port $Port
    if ($null -eq $ownerPid) {
        return $null
    }

    $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    if ($null -eq $owner) {
        return $null
    }

    return $owner.ProcessName
}

function Try-StopKubectlOnPort {
    param([int]$Port)
    $ownerPid = Get-PortOwnerPid -Port $Port
    if ($null -eq $ownerPid) {
        return
    }

    $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    if ($null -ne $owner -and $owner.ProcessName -eq "kubectl") {
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

function Ensure-PortAvailable {
    param([int]$Port, [string]$Purpose)
    if (Test-PortBusy -Port $Port) {
        throw "Port $Port is already in use. Free it before starting $Purpose."
    }
}

if (-not (Test-CommandExists -Name "kubectl")) {
    throw "kubectl was not found in PATH."
}

# Validate namespace/services before starting background forwards.
kubectl get namespace $Namespace | Out-Null
kubectl -n $Namespace get svc frontend | Out-Null
kubectl -n $Namespace get svc api-gateway | Out-Null
kubectl -n $Namespace get svc grafana | Out-Null
kubectl -n $Namespace get svc prometheus | Out-Null

# If previous runs left kubectl forwards, clean them up and re-check.
Try-StopKubectlOnPort -Port $FrontendLocalPort
Try-StopKubectlOnPort -Port $GatewayLocalPort
Try-StopKubectlOnPort -Port $GrafanaLocalPort
Try-StopKubectlOnPort -Port $PrometheusLocalPort

$reuseFrontend = $false
$reuseGateway = $false
$reuseGrafana = $false
$reusePrometheus = $false

if (Test-PortBusy -Port $FrontendLocalPort) {
    $ownerName = Get-PortOwnerProcessName -Port $FrontendLocalPort
    if ($ownerName -eq "kubectl") {
        $reuseFrontend = $true
        Write-Output "Port $FrontendLocalPort is already active via kubectl. Reusing existing frontend tunnel."
    } else {
        throw "Port $FrontendLocalPort is already in use by process '$ownerName'. Choose another FrontendLocalPort."
    }
}

if (Test-PortBusy -Port $GatewayLocalPort) {
    $ownerName = Get-PortOwnerProcessName -Port $GatewayLocalPort
    if ($ownerName -eq "kubectl") {
        $reuseGateway = $true
        Write-Output "Port $GatewayLocalPort is already active via kubectl. Reusing existing api-gateway tunnel."
    } else {
        throw "Port $GatewayLocalPort is already in use by process '$ownerName'. Choose another GatewayLocalPort."
    }
}

if (Test-PortBusy -Port $GrafanaLocalPort) {
    $ownerName = Get-PortOwnerProcessName -Port $GrafanaLocalPort
    if ($ownerName -eq "kubectl") {
        $reuseGrafana = $true
        Write-Output "Port $GrafanaLocalPort is already active via kubectl. Reusing existing grafana tunnel."
    } else {
        throw "Port $GrafanaLocalPort is already in use by process '$ownerName'. Choose another GrafanaLocalPort."
    }
}

if (Test-PortBusy -Port $PrometheusLocalPort) {
    $ownerName = Get-PortOwnerProcessName -Port $PrometheusLocalPort
    if ($ownerName -eq "kubectl") {
        $reusePrometheus = $true
        Write-Output "Port $PrometheusLocalPort is already active via kubectl. Reusing existing prometheus tunnel."
    } else {
        throw "Port $PrometheusLocalPort is already in use by process '$ownerName'. Choose another PrometheusLocalPort."
    }
}

if (-not $reuseFrontend) {
    Ensure-PortAvailable -Port $FrontendLocalPort -Purpose "frontend port-forward"
}

if (-not $reuseGateway) {
    Ensure-PortAvailable -Port $GatewayLocalPort -Purpose "api-gateway port-forward"
}

if (-not $reuseGrafana) {
    Ensure-PortAvailable -Port $GrafanaLocalPort -Purpose "grafana port-forward"
}

if (-not $reusePrometheus) {
    Ensure-PortAvailable -Port $PrometheusLocalPort -Purpose "prometheus port-forward"
}

$frontendArgs = "-n $Namespace port-forward svc/frontend ${FrontendLocalPort}:80"
$gatewayArgs = "-n $Namespace port-forward svc/api-gateway ${GatewayLocalPort}:80"
$grafanaArgs = "-n $Namespace port-forward svc/grafana ${GrafanaLocalPort}:3000"
$prometheusArgs = "-n $Namespace port-forward svc/prometheus ${PrometheusLocalPort}:9090"

$frontendProc = $null
$gatewayProc = $null
$grafanaProc = $null
$prometheusProc = $null

if (-not $reuseFrontend) {
    $frontendProc = Start-Process -FilePath "kubectl" -ArgumentList $frontendArgs -PassThru -WindowStyle Hidden
}

if (-not $reuseGateway) {
    $gatewayProc = Start-Process -FilePath "kubectl" -ArgumentList $gatewayArgs -PassThru -WindowStyle Hidden
}

if (-not $reuseGrafana) {
    $grafanaProc = Start-Process -FilePath "kubectl" -ArgumentList $grafanaArgs -PassThru -WindowStyle Hidden
}

if (-not $reusePrometheus) {
    $prometheusProc = Start-Process -FilePath "kubectl" -ArgumentList $prometheusArgs -PassThru -WindowStyle Hidden
}

Start-Sleep -Seconds 2

$state = [ordered]@{
    namespace = $Namespace
    frontendPort = $FrontendLocalPort
    gatewayPort = $GatewayLocalPort
    grafanaPort = $GrafanaLocalPort
    prometheusPort = $PrometheusLocalPort
    frontendPid = if ($null -ne $frontendProc) { $frontendProc.Id } else { $null }
    gatewayPid = if ($null -ne $gatewayProc) { $gatewayProc.Id } else { $null }
    grafanaPid = if ($null -ne $grafanaProc) { $grafanaProc.Id } else { $null }
    prometheusPid = if ($null -ne $prometheusProc) { $prometheusProc.Id } else { $null }
    startedAt = (Get-Date).ToString("o")
}

$state | ConvertTo-Json | Set-Content -Path $stateFile

Write-Output "Port-forwards started."
Write-Output "Frontend URL: http://127.0.0.1:$FrontendLocalPort"
Write-Output "API URL:      http://127.0.0.1:$GatewayLocalPort"
Write-Output "Grafana URL:  http://127.0.0.1:$GrafanaLocalPort"
Write-Output "Prom URL:     http://127.0.0.1:$PrometheusLocalPort"
Write-Output "API Health:   http://127.0.0.1:$GatewayLocalPort/health"
Write-Output "State file:   $stateFile"
Write-Output "Use scripts/stop-local-access.ps1 to stop both forwards."

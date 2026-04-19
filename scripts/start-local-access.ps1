param(
    [string]$Namespace = "rks-logistics",
    [int]$FrontendLocalPort = 8080,
    [int]$GatewayLocalPort = 3200
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

# If previous runs left kubectl forwards, clean them up and re-check.
Try-StopKubectlOnPort -Port $FrontendLocalPort
Try-StopKubectlOnPort -Port $GatewayLocalPort

$reuseFrontend = $false
$reuseGateway = $false

if (Test-PortBusy -Port $FrontendLocalPort) {
    $reuseFrontend = $true
    Write-Output "Port $FrontendLocalPort is already active. Reusing existing frontend tunnel."
}

if (Test-PortBusy -Port $GatewayLocalPort) {
    $reuseGateway = $true
    Write-Output "Port $GatewayLocalPort is already active. Reusing existing api-gateway tunnel."
}

if (-not $reuseFrontend) {
    Ensure-PortAvailable -Port $FrontendLocalPort -Purpose "frontend port-forward"
}

if (-not $reuseGateway) {
    Ensure-PortAvailable -Port $GatewayLocalPort -Purpose "api-gateway port-forward"
}

$frontendArgs = "-n $Namespace port-forward svc/frontend ${FrontendLocalPort}:80"
$gatewayArgs = "-n $Namespace port-forward svc/api-gateway ${GatewayLocalPort}:80"

$frontendProc = $null
$gatewayProc = $null

if (-not $reuseFrontend) {
    $frontendProc = Start-Process -FilePath "kubectl" -ArgumentList $frontendArgs -PassThru -WindowStyle Hidden
}

if (-not $reuseGateway) {
    $gatewayProc = Start-Process -FilePath "kubectl" -ArgumentList $gatewayArgs -PassThru -WindowStyle Hidden
}

Start-Sleep -Seconds 2

$state = [ordered]@{
    namespace = $Namespace
    frontendPort = $FrontendLocalPort
    gatewayPort = $GatewayLocalPort
    frontendPid = if ($null -ne $frontendProc) { $frontendProc.Id } else { $null }
    gatewayPid = if ($null -ne $gatewayProc) { $gatewayProc.Id } else { $null }
    startedAt = (Get-Date).ToString("o")
}

$state | ConvertTo-Json | Set-Content -Path $stateFile

Write-Output "Port-forwards started."
Write-Output "Frontend URL: http://127.0.0.1:$FrontendLocalPort"
Write-Output "API URL:      http://127.0.0.1:$GatewayLocalPort"
Write-Output "API Health:   http://127.0.0.1:$GatewayLocalPort/health"
Write-Output "State file:   $stateFile"
Write-Output "Use scripts/stop-local-access.ps1 to stop both forwards."

param(
    [Parameter(Mandatory = $true)]
    [string]$GitHubToken,
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [string]$Repo,
    [Parameter(Mandatory = $true)]
    [string]$WebhookUrl,
    [string]$WebhookSecret = ""
)

$ErrorActionPreference = "Stop"

$apiBase = "https://api.github.com/repos/$Owner/$Repo"
$headers = @{
    Authorization = "Bearer $GitHubToken"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "rks-transports-cicd-setup"
}

$hooksUri = "$apiBase/hooks"
$hooks = Invoke-RestMethod -Method Get -Uri $hooksUri -Headers $headers
$existing = $hooks | Where-Object { $_.config.url -eq $WebhookUrl } | Select-Object -First 1

$hookConfig = @{
    url          = $WebhookUrl
    content_type = "json"
    insecure_ssl = "0"
}

if (-not [string]::IsNullOrWhiteSpace($WebhookSecret)) {
    $hookConfig.secret = $WebhookSecret
}

if ($null -ne $existing) {
    $patchUri = "$apiBase/hooks/$($existing.id)"
    $body = @{
        active = $true
        events = @("push")
        config = $hookConfig
    } | ConvertTo-Json -Depth 5

    Invoke-RestMethod -Method Patch -Uri $patchUri -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Updated existing webhook (id=$($existing.id)) for $Owner/$Repo"
}
else {
    $body = @{
        name   = "web"
        active = $true
        events = @("push")
        config = $hookConfig
    } | ConvertTo-Json -Depth 5

    Invoke-RestMethod -Method Post -Uri $hooksUri -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Created webhook for $Owner/$Repo"
}

Write-Host "Webhook URL configured: $WebhookUrl"

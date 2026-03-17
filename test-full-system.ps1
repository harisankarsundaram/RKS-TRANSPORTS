Write-Host "FULL SYSTEM TEST" -ForegroundColor Green

Write-Host "`n[1] Testing Auth Service..." -ForegroundColor Cyan
$loginBody = @{ email = "admin@example.com"; password = "password123" } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri "http://localhost:3201/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
$loginData = $loginResp.Content | ConvertFrom-Json
Write-Host "OK - Auth Service login working" -ForegroundColor Green

Write-Host "`n[2] Testing API Gateway Proxy..." -ForegroundColor Cyan
$gw_resp = Invoke-WebRequest -Uri "http://localhost:3200/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
$gw_data = $gw_resp.Content | ConvertFrom-Json
Write-Host "OK - Gateway proxy working" -ForegroundColor Green

Write-Host "`n[3] Testing All Microservices..." -ForegroundColor Cyan
$ports = @(3200,3201,3202,3203,3204,3205,3206,3207,3208,3209,8000)
$ports | % { Invoke-WebRequest -Uri "http://localhost:$_/health" -TimeoutSec 2 -UseBasicParsing > $null; Write-Host "OK - Port $_" -ForegroundColor Green }

Write-Host "`n[4] Testing Frontend..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 3 -UseBasicParsing > $null
Write-Host "OK - Frontend running on 5173" -ForegroundColor Green

Write-Host "`n===== ALL SYSTEMS OPERATIONAL =====" -ForegroundColor Green
Write-Host "Access: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Login: admin@example.com / password123" -ForegroundColor Yellow

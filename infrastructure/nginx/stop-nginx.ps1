# Nginx 负载均衡器停止脚本 (PowerShell)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "🛑 Stopping Nginx Load Balancer..." -ForegroundColor Cyan

docker-compose down

Write-Host "✅ Nginx stopped successfully!" -ForegroundColor Green
































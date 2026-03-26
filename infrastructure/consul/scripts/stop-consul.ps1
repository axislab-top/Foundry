# 停止 Consul 服务脚本 (PowerShell)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConsulDir = Split-Path -Parent $ScriptDir

Write-Host "🛑 Stopping Consul service..." -ForegroundColor Cyan

Set-Location $ConsulDir

docker-compose down

Write-Host "✅ Consul stopped successfully!" -ForegroundColor Green






































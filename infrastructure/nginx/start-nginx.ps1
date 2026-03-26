# Nginx 负载均衡器启动脚本 (PowerShell)

param(
    [string]$Env = "dev"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "🚀 Starting Nginx Load Balancer ($Env environment)..." -ForegroundColor Cyan

# 检查配置文件
if (-not (Test-Path "nginx.conf")) {
    Write-Host "❌ Error: nginx.conf not found!" -ForegroundColor Red
    exit 1
}

# 检查 Docker Compose
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: docker-compose not found!" -ForegroundColor Red
    exit 1
}

# 根据环境启动
switch ($Env.ToLower()) {
    { $_ -in "dev", "development" } {
        Write-Host "📦 Starting in development mode..." -ForegroundColor Yellow
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    }
    { $_ -in "prod", "production" } {
        Write-Host "📦 Starting in production mode..." -ForegroundColor Yellow
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    }
    default {
        Write-Host "❌ Error: Invalid environment '$Env'" -ForegroundColor Red
        Write-Host "Usage: .\start-nginx.ps1 [dev|prod]" -ForegroundColor Yellow
        exit 1
    }
}

# 等待服务启动
Write-Host "⏳ Waiting for Nginx to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

# 检查健康状态
$Services = docker-compose ps 2>&1
if ($Services -match "Up") {
    Write-Host "✅ Nginx started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Service status:" -ForegroundColor Cyan
    docker-compose ps
    Write-Host ""
    Write-Host "🔍 Health check:" -ForegroundColor Cyan
    try {
        $Response = Invoke-WebRequest -Uri "http://localhost/health" -UseBasicParsing -TimeoutSec 5
        Write-Host $Response.Content -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Health check endpoint not responding" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "📝 View logs: docker-compose logs -f nginx" -ForegroundColor Cyan
} else {
    Write-Host "❌ Error: Nginx failed to start" -ForegroundColor Red
    docker-compose logs nginx
    exit 1
}
































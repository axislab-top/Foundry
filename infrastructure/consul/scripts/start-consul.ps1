# 启动 Consul 服务脚本 (PowerShell)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConsulDir = Split-Path -Parent $ScriptDir

Write-Host "🚀 Starting Consul service..." -ForegroundColor Cyan

Set-Location $ConsulDir

# 检查 .env 文件
if (-not (Test-Path .env)) {
    Write-Host "⚠️  .env file not found, copying from env.example..." -ForegroundColor Yellow
    Copy-Item env.example .env
    Write-Host "✅ Created .env file, please review and update if needed" -ForegroundColor Green
}

# 根据环境变量选择配置文件
$Env = $env:NODE_ENV
if (-not $Env) {
    $Env = "development"
}

switch ($Env) {
    "production" {
        Write-Host "📦 Starting Consul in PRODUCTION mode..." -ForegroundColor Yellow
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    }
    "test" {
        Write-Host "🧪 Starting Consul in TEST mode..." -ForegroundColor Yellow
        docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d
    }
    default {
        Write-Host "🔧 Starting Consul in DEVELOPMENT mode..." -ForegroundColor Yellow
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    }
}

Write-Host "⏳ Waiting for Consul to be healthy..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# 检查 Consul 健康状态
$Status = docker-compose ps consul 2>&1
if ($Status -match "Up") {
    Write-Host "✅ Consul started successfully!" -ForegroundColor Green
    Write-Host "🌐 Consul UI: http://localhost:8500" -ForegroundColor Cyan
    Write-Host "📊 Check status: docker-compose ps consul" -ForegroundColor Cyan
    Write-Host "📝 View logs: docker-compose logs -f consul" -ForegroundColor Cyan
} else {
    Write-Host "❌ Consul failed to start. Check logs: docker-compose logs consul" -ForegroundColor Red
    exit 1
}






































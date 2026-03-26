# Redis 启动脚本 (PowerShell)
# 启动 Redis 服务

Write-Host "Starting Redis service..." -ForegroundColor Cyan

# 检查 .env 文件
if (-not (Test-Path .env)) {
    Write-Host "Warning: .env file not found. Using default configuration." -ForegroundColor Yellow
    Write-Host "You can copy .env.example to .env and customize it." -ForegroundColor Yellow
}

# 启动服务
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "Redis service started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To view logs: docker-compose logs -f redis" -ForegroundColor Cyan
    Write-Host "To stop: docker-compose down" -ForegroundColor Cyan
} else {
    Write-Host "Failed to start Redis service!" -ForegroundColor Red
    exit 1
}













































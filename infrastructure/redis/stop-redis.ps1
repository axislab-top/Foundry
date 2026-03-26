# Redis 停止脚本 (PowerShell)
# 停止 Redis 服务

Write-Host "Stopping Redis service..." -ForegroundColor Cyan

docker-compose down

if ($LASTEXITCODE -eq 0) {
    Write-Host "Redis service stopped successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to stop Redis service!" -ForegroundColor Red
    exit 1
}













































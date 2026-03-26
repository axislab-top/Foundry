# PostgreSQL 本地停止脚本 (Windows)
# 停止本地安装的 PostgreSQL 服务

param(
    [string]$ServiceName = "postgresql-x64-18"
)

Write-Host "正在停止 PostgreSQL 服务..." -ForegroundColor Yellow

# 检查服务是否存在
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if (-not $service) {
    Write-Host "错误: 找不到 PostgreSQL 服务 '$ServiceName'" -ForegroundColor Red
    exit 1
}

# 检查服务状态
if ($service.Status -eq 'Stopped') {
    Write-Host "PostgreSQL 服务已经停止" -ForegroundColor Yellow
    exit 0
}

# 停止服务
try {
    Stop-Service -Name $ServiceName -Force
    Write-Host "PostgreSQL 服务已成功停止" -ForegroundColor Green
} catch {
    Write-Host "错误: 无法停止 PostgreSQL 服务" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "请以管理员身份运行此脚本" -ForegroundColor Yellow
    exit 1
}














































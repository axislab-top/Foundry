# PostgreSQL 本地启动脚本 (Windows)
# 启动本地安装的 PostgreSQL 服务

param(
    [string]$ServiceName = "postgresql-x64-18"
)

Write-Host "正在启动 PostgreSQL 服务..." -ForegroundColor Green

# 检查服务是否存在
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if (-not $service) {
    Write-Host "错误: 找不到 PostgreSQL 服务 '$ServiceName'" -ForegroundColor Red
    Write-Host "请确保已安装 PostgreSQL 18" -ForegroundColor Yellow
    Write-Host "服务名称可能是: postgresql-x64-18 或 postgresql-x64-16 等" -ForegroundColor Yellow
    exit 1
}

# 检查服务状态
if ($service.Status -eq 'Running') {
    Write-Host "PostgreSQL 服务已经在运行中" -ForegroundColor Yellow
    exit 0
}

# 启动服务
try {
    Start-Service -Name $ServiceName
    Write-Host "PostgreSQL 服务已成功启动" -ForegroundColor Green
    
    # 等待服务完全启动
    Start-Sleep -Seconds 2
    
    # 验证连接
    $pgBin = "C:\Program Files\PostgreSQL\18\bin"
    if (Test-Path "$pgBin\psql.exe") {
        $env:PGPASSWORD = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "postgres" }
        $result = & "$pgBin\psql.exe" -U postgres -d postgres -c "SELECT version();" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "PostgreSQL 已就绪，可以接受连接" -ForegroundColor Green
        } else {
            Write-Host "警告: 服务已启动，但无法验证连接" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "错误: 无法启动 PostgreSQL 服务" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "请以管理员身份运行此脚本" -ForegroundColor Yellow
    exit 1
}














































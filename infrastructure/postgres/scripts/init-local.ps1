# PostgreSQL 本地初始化脚本 (Windows)
# 初始化数据库和运行初始化脚本

param(
    [string]$DatabaseName = $env:POSTGRES_DB,
    [string]$UserName = $env:POSTGRES_USER,
    [string]$Password = $env:POSTGRES_PASSWORD
)

if (-not $DatabaseName) {
    $DatabaseName = "service_db"
}

if (-not $UserName) {
    $UserName = "postgres"
}

if (-not $Password) {
    $Password = "postgres"
}

$pgBin = "C:\Program Files\PostgreSQL\18\bin"
$initScript = "D:\Service\infrastructure\postgres\init-scripts\01-init-database.sql"

# 检查 PostgreSQL 是否安装
if (-not (Test-Path "$pgBin\psql.exe")) {
    Write-Host "错误: 找不到 PostgreSQL 安装" -ForegroundColor Red
    Write-Host "请确保 PostgreSQL 18 已安装，并且 bin 目录在 PATH 中" -ForegroundColor Yellow
    exit 1
}

# 检查服务是否运行
$service = Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue
if (-not $service -or $service.Status -ne 'Running') {
    Write-Host "错误: PostgreSQL 服务未运行" -ForegroundColor Red
    Write-Host "请先启动 PostgreSQL 服务: .\scripts\start-local.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "正在初始化数据库..." -ForegroundColor Green
Write-Host "数据库: $DatabaseName" -ForegroundColor Cyan
Write-Host "用户: $UserName" -ForegroundColor Cyan

# 设置密码环境变量
$env:PGPASSWORD = $Password

# 检查数据库是否存在
$dbExists = & "$pgBin\psql.exe" -U $UserName -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'" 2>&1

if ($dbExists -eq "1") {
    Write-Host "数据库 '$DatabaseName' 已存在，跳过创建" -ForegroundColor Yellow
} else {
    Write-Host "创建数据库 '$DatabaseName'..." -ForegroundColor Cyan
    & "$pgBin\psql.exe" -U $UserName -d postgres -c "CREATE DATABASE $DatabaseName;" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "错误: 无法创建数据库" -ForegroundColor Red
        exit 1
    }
    Write-Host "数据库创建成功" -ForegroundColor Green
}

# 运行初始化脚本
if (Test-Path $initScript) {
    Write-Host "运行初始化脚本..." -ForegroundColor Cyan
    & "$pgBin\psql.exe" -U $UserName -d $DatabaseName -f $initScript
    if ($LASTEXITCODE -eq 0) {
        Write-Host "初始化脚本执行成功" -ForegroundColor Green
    } else {
        Write-Host "警告: 初始化脚本执行时出现错误（某些命令可能已存在）" -ForegroundColor Yellow
    }
} else {
    Write-Host "警告: 找不到初始化脚本: $initScript" -ForegroundColor Yellow
}

Write-Host "`n初始化完成！" -ForegroundColor Green
Write-Host "可以使用以下命令连接数据库:" -ForegroundColor Cyan
Write-Host "  psql -U $UserName -d $DatabaseName" -ForegroundColor White














































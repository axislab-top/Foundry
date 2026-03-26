# 启动日志服务脚本 (PowerShell)
# 用法: .\start-logging.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DockerComposeFile = Join-Path $ScriptDir "docker-compose.yml"

Write-Host "正在启动日志服务..." -ForegroundColor Green

# 检查 Docker 是否运行
try {
    docker info | Out-Null
} catch {
    Write-Host "错误: Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}

# 检查环境变量文件
$EnvFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "警告: 未找到 .env 文件，使用默认配置" -ForegroundColor Yellow
    Write-Host "提示: 可以复制 env.example 到 .env 来自定义配置" -ForegroundColor Yellow
}

# 创建日志目录
$LogDir = Join-Path $ScriptDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
    Write-Host "已创建日志目录: $LogDir" -ForegroundColor Green
}

# 启动服务
Write-Host "正在启动 Loki、Promtail 和 Grafana..." -ForegroundColor Cyan
docker-compose -f $DockerComposeFile --profile loki up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n日志服务启动成功！" -ForegroundColor Green
    Write-Host "`n服务访问地址:" -ForegroundColor Cyan
    Write-Host "  - Loki API: http://localhost:3100" -ForegroundColor White
    Write-Host "  - Promtail: http://localhost:9080" -ForegroundColor White
    Write-Host "  - Grafana:  http://localhost:3000" -ForegroundColor White
    Write-Host "`nGrafana 默认登录信息:" -ForegroundColor Cyan
    Write-Host "  用户名: admin" -ForegroundColor White
    Write-Host "  密码:   admin" -ForegroundColor White
    Write-Host "`n提示: 首次登录后请修改默认密码" -ForegroundColor Yellow
} else {
    Write-Host "`n日志服务启动失败！" -ForegroundColor Red
    exit 1
}



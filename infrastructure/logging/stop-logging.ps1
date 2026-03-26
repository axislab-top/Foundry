# 停止日志服务脚本 (PowerShell)
# 用法: .\stop-logging.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DockerComposeFile = Join-Path $ScriptDir "docker-compose.yml"

Write-Host "正在停止日志服务..." -ForegroundColor Yellow

docker-compose -f $DockerComposeFile --profile loki down

if ($LASTEXITCODE -eq 0) {
    Write-Host "日志服务已停止" -ForegroundColor Green
} else {
    Write-Host "停止日志服务时出错" -ForegroundColor Red
    exit 1
}



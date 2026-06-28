# ============================================================================
# 数据库引导脚本 — 首次安装时使用 (PowerShell)
# ============================================================================

$ErrorActionPreference = "Stop"
$DB_USER = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "postgres" }
$DB_NAME = if ($env:DB_DATABASE) { $env:DB_DATABASE } else { "service_db" }
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BASELINE_SQL = Join-Path $PROJECT_ROOT "infrastructure\postgres\migrations\baseline-schema.sql"

Write-Host "=== Foundry 数据库初始化 ===" -ForegroundColor Yellow

if (!(Test-Path $BASELINE_SQL)) {
  Write-Host "❌ 找不到 baseline-schema.sql" -ForegroundColor Red; exit 1
}

Write-Host -NoNewline "等待 PostgreSQL..."
for ($i = 0; $i -lt 30; $i++) {
  docker exec service-postgres pg_isready -U $DB_USER 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host " 就绪" -ForegroundColor Green; break }
  if ($i -eq 29) { Write-Host " 超时" -ForegroundColor Red; exit 1 }
  Start-Sleep 1
}

Write-Host -NoNewline "创建数据库表..."
Get-Content $BASELINE_SQL | Where-Object { $_ -notmatch "COMMENT ON" -and $_ -notmatch "set_config" -and $_ -notmatch "^\\\\" } | docker exec -i service-postgres psql -U $DB_USER -d $DB_NAME 2>$null | Out-Null
$TABLE_COUNT = (docker exec service-postgres psql -U $DB_USER -d $DB_NAME -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>$null).Trim()
Write-Host " 完成 ($TABLE_COUNT 张表)" -ForegroundColor Green

Write-Host ""
Write-Host "✅ 数据库初始化完成" -ForegroundColor Green

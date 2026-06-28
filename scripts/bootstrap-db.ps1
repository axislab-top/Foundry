# ============================================================================
# 数据库引导脚本 — 给新用户首次安装使用 (PowerShell)
# ============================================================================

$ErrorActionPreference = "Stop"

$DB_USER = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "postgres" }
$DB_NAME = if ($env:DB_DATABASE) { $env:DB_DATABASE } else { "service_db" }

$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BASELINE_SQL = Join-Path $PROJECT_ROOT "infrastructure\postgres\migrations\baseline-schema.sql"

Write-Host "=== Foundry 数据库引导 ===" -ForegroundColor Yellow
Write-Host ""

# Step 1: 检查 baseline SQL
if (!(Test-Path $BASELINE_SQL)) {
  Write-Host "❌ 找不到 baseline-schema.sql" -ForegroundColor Red
  exit 1
}

# Step 2: 等待 PostgreSQL 就绪
Write-Host "等待 PostgreSQL 就绪..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  $result = docker exec service-postgres pg_isready -U $DB_USER 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL 已就绪" -ForegroundColor Green
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (!$ready) {
  Write-Host "❌ PostgreSQL 未就绪，请先运行 pnpm infra:start" -ForegroundColor Red
  exit 1
}

# Step 3: 执行 baseline SQL
Write-Host "创建数据库表..." -ForegroundColor Yellow
$sqlContent = Get-Content $BASELINE_SQL | Where-Object { $_ -notmatch "COMMENT ON" -and $_ -notmatch "^\\\\" -and $_ -notmatch "set_config" }
$sqlContent | docker exec -i service-postgres psql -U $DB_USER -d $DB_NAME 2>$null
$tableCount = (docker exec service-postgres psql -U $DB_USER -d $DB_NAME -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>$null).Trim()
Write-Host "✅ 已创建 $tableCount 张表" -ForegroundColor Green

# Step 4: 标记所有迁移为已执行
Write-Host "标记迁移记录..." -ForegroundColor Yellow
docker exec service-postgres psql -U $DB_USER -d $DB_NAME -c "CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, timestamp BIGINT NOT NULL, name VARCHAR(255) NOT NULL);" 2>$null | Out-Null

$migrationDir = Join-Path $PROJECT_ROOT "infrastructure\postgres\migrations"
$files = Get-ChildItem -Path $migrationDir -Filter "*.ts" -Recurse
$marked = 0
foreach ($f in $files) {
  $content = Get-Content $f.FullName -Raw
  if ($content -match "name = '([^']+)'") {
    $name = $matches[1]
    if ($name -match '(\d+)$') {
      $ts = $matches[1]
      docker exec service-postgres psql -U $DB_USER -d $DB_NAME -c "INSERT INTO migrations (timestamp, name) VALUES ($ts, '$name') ON CONFLICT DO NOTHING;" 2>$null | Out-Null
      $marked++
    }
  }
}
Write-Host "✅ 已标记 $marked 个迁移" -ForegroundColor Green

Write-Host ""
Write-Host "=== 数据库引导完成 ===" -ForegroundColor Green
Write-Host "表数量: $tableCount"
Write-Host "迁移记录: $marked"
Write-Host ""
Write-Host "下一步: pnpm dev" -ForegroundColor Yellow

# 备份本机 Docker 中的 PostgreSQL 与 API storage
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot "deployment/cloud/tencent-lighthouse/release/backup"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$pgContainer = @("service-postgres-dev", "service-postgres", "service-postgres-prod") | Where-Object {
  (docker ps --format "{{.Names}}" 2>$null) -contains $_
} | Select-Object -First 1

function Export-Db([string]$Container, [string]$DbName, [string]$OutFile) {
  $tmp = "/tmp/foundry-backup.dump"
  docker exec $Container pg_dump -U postgres -Fc $DbName -f $tmp 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  docker cp "${Container}:${tmp}" $OutFile 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  docker exec $Container rm -f $tmp 2>$null | Out-Null
  return (Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 100)
}

if (-not $pgContainer) {
  Write-Warning "PostgreSQL container not running; skip DB backup"
} else {
  Write-Host "Backing up from $pgContainer ..."
  # 生产数据在 service_db；dev 库常为空的 service_db_dev，必须优先备份 service_db
  $mainDbs = @("service_db", "service_db_dev")
  foreach ($db in $mainDbs) {
    $out = Join-Path $OutDir "foundry-db.dump"
    if (Export-Db $pgContainer $db $out) {
      $sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)
      Write-Host "  OK $db -> foundry-db.dump (${sizeMb} MB)"
      if ($sizeMb -lt 1) {
        Write-Warning "  Dump is very small; if you expected production data, confirm DB_DATABASE=service_db"
      }
      break
    }
  }
  $gwOut = Join-Path $OutDir "foundry-gateway-db.dump"
  if (Export-Db $pgContainer "gateway_db" $gwOut) {
    Write-Host "  OK gateway_db -> foundry-gateway-db.dump"
  }
}

$apiContainer = @("service-api", "service-api-prod") | Where-Object {
  (docker ps --format "{{.Names}}" 2>$null) -contains $_
} | Select-Object -First 1

$storageOut = Join-Path $OutDir "api-storage"
if ($apiContainer) {
  Write-Host "Backing up API storage from $apiContainer ..."
  if (Test-Path $storageOut) { Remove-Item -Recurse -Force $storageOut }
  New-Item -ItemType Directory -Force -Path $storageOut | Out-Null
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  docker cp "${apiContainer}:/app/storage/." $storageOut 2>&1 | Out-Null
  $ErrorActionPreference = $prevEap
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "No /app/storage in container; using local files only"
  }
}

$localStorage = Join-Path $RepoRoot "apps/api/storage"
if (Test-Path $localStorage) {
  $count = (Get-ChildItem $localStorage -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($count -gt 0) {
    Write-Host "Merging local apps/api/storage ($count files) ..."
    New-Item -ItemType Directory -Force -Path $storageOut | Out-Null
    robocopy $localStorage $storageOut /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  }
}

Write-Host "Backup -> $OutDir"

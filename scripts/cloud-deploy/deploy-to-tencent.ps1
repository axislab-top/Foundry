# 本机 → 腾讯云 一键部署
param(
  [string]$Server = "ubuntu@101.43.9.37",
  [string]$RemoteDir = "/opt/foundry",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
  [string]$SshKey = "",
  [switch]$SkipBuild,
  [switch]$SkipExport,
  [string[]]$OnlyImages = @(),  # 例: nginx,api — 只导出/上传指定镜像
  [switch]$SkipUpload,
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

$releaseDir = Join-Path $RepoRoot "deployment/cloud/tencent-lighthouse/release"
$bundleDir = Join-Path $releaseDir "bundle"
if (Test-Path $bundleDir) { Remove-Item -Recurse -Force $bundleDir }
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

# SSL 检查（支持 cert.pem/key.pem 或 www.axislab.top.pem/.key）
$sslDir = Join-Path $RepoRoot "infrastructure/nginx/ssl"
$sslCert = Join-Path $sslDir "cert.pem"
$sslKey = Join-Path $sslDir "key.pem"
if (-not (Test-Path $sslCert)) {
  $altCert = Get-ChildItem $sslDir -Filter "*.pem" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($altCert) { Copy-Item -Force $altCert.FullName $sslCert; Write-Host "SSL cert: $($altCert.Name) -> cert.pem" }
}
if (-not (Test-Path $sslKey)) {
  $altKey = Get-ChildItem $sslDir -Filter "*.key" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($altKey) { Copy-Item -Force $altKey.FullName $sslKey; Write-Host "SSL key: $($altKey.Name) -> key.pem" }
}
if (-not (Test-Path $sslCert) -or -not (Test-Path $sslKey)) {
  Write-Host @"

WARNING: SSL 证书未找到。
请将证书放到：
  infrastructure/nginx/ssl/cert.pem
  infrastructure/nginx/ssl/key.pem

继续打包（无 HTTPS 时 nginx 会启动失败）...
"@
}

& (Join-Path $PSScriptRoot "prepare-env.ps1") -RepoRoot $RepoRoot

if (-not $SkipBackup) {
  & (Join-Path $PSScriptRoot "backup-local-data.ps1") -RepoRoot $RepoRoot -OutDir (Join-Path $releaseDir "backup")
}

if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot "build-release.ps1") -RepoRoot $RepoRoot -PublicOrigin "https://axislab.top"
}

Write-Host "==> Exporting images to tar (may take several minutes)..."
$imageTar = Join-Path $releaseDir "foundry-images.tar"
$allImages = @(
  "foundry/nginx:latest",
  "foundry/api:latest",
  "foundry/gateway:latest",
  "foundry/worker:latest",
  "foundry/webhooks:latest",
  "foundry/logging:latest"
)
if ($OnlyImages.Count -gt 0) {
  $allImages = $OnlyImages | ForEach-Object { "foundry/${_}:latest" }
  $imageTar = Join-Path $releaseDir "foundry-images-partial.tar"
}
if ($SkipExport -and (Test-Path $imageTar)) {
  Write-Host "SkipExport: reusing $imageTar"
} else {
  docker save @allImages -o $imageTar
  if ($LASTEXITCODE -ne 0) { throw "docker save failed" }
}
if (-not (Test-Path $imageTar)) { throw "Image tar not found: $imageTar" }

Write-Host "==> Assembling bundle..."
function Copy-TreeLite([string]$Src, [string]$Dest, [string[]]$ExcludeDirNames = @("node_modules", ".turbo", "dist", "data")) {
  if (-not (Test-Path $Src)) { return }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Get-ChildItem -LiteralPath $Src -Force | ForEach-Object {
    if ($ExcludeDirNames -contains $_.Name) { return }
    $target = Join-Path $Dest $_.Name
    if ($_.PSIsContainer) {
      Copy-TreeLite $_.FullName $target $ExcludeDirNames
    } else {
      Copy-Item -Force $_.FullName $target
    }
  }
}

$copyItems = @(
  @{ Src = "deployment/docker/docker-compose.yml"; Dest = "deployment/docker/docker-compose.yml" },
  @{ Src = "deployment/cloud/tencent-lighthouse/compose.images.yml"; Dest = "deployment/cloud/tencent-lighthouse/compose.images.yml" },
  @{ Src = "deployment/cloud/tencent-lighthouse/compose.prod.yml"; Dest = "deployment/cloud/tencent-lighthouse/compose.prod.yml" },
  @{ Src = "deployment/cloud/tencent-lighthouse/README.md"; Dest = "deployment/cloud/tencent-lighthouse/README.md" },
  @{ Src = "infrastructure/nginx/nginx.conf"; Dest = "infrastructure/nginx/nginx.conf" },
  @{ Src = "infrastructure/nginx/conf.d"; Dest = "infrastructure/nginx/conf.d" },
  @{ Src = "infrastructure/nginx/ssl"; Dest = "infrastructure/nginx/ssl" },
  @{ Src = "scripts/cloud-deploy/install-on-server.sh"; Dest = "scripts/cloud-deploy/install-on-server.sh" },
  @{ Src = "scripts/cloud-deploy/cleanup-server-before-rebuild.sh"; Dest = "scripts/cloud-deploy/cleanup-server-before-rebuild.sh" }
)
foreach ($item in $copyItems) {
  $src = Join-Path $RepoRoot $item.Src
  $dest = Join-Path $bundleDir $item.Dest
  if (-not (Test-Path $src)) { Write-Warning "Missing: $($item.Src)"; continue }
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  if ((Get-Item $src).PSIsContainer) {
    Copy-TreeLite $src $dest
  } else {
    Copy-Item -Force $src $dest
  }
}

# 基础设施：仅配置与初始化脚本
$infraLite = @(
  @{ Src = "infrastructure/postgres/.env"; Dest = "infrastructure/postgres/.env" },
  @{ Src = "infrastructure/postgres/config"; Dest = "infrastructure/postgres/config" },
  @{ Src = "infrastructure/postgres/init-scripts"; Dest = "infrastructure/postgres/init-scripts" },
  @{ Src = "infrastructure/redis/.env"; Dest = "infrastructure/redis/.env" },
  @{ Src = "infrastructure/redis/config"; Dest = "infrastructure/redis/config" },
  @{ Src = "infrastructure/messaging/.env"; Dest = "infrastructure/messaging/.env" },
  @{ Src = "infrastructure/messaging/config"; Dest = "infrastructure/messaging/config" },
  @{ Src = "infrastructure/logging/config"; Dest = "infrastructure/logging/config" }
)
foreach ($item in $infraLite) {
  $src = Join-Path $RepoRoot $item.Src
  $dest = Join-Path $bundleDir $item.Dest
  if (-not (Test-Path $src)) { continue }
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  if ((Get-Item $src).PSIsContainer) {
    Copy-TreeLite $src $dest
  } else {
    Copy-Item -Force $src $dest
  }
}

Copy-Item -Force (Join-Path $RepoRoot "deployment/docker/.env") (Join-Path $bundleDir "deployment/docker/.env")
New-Item -ItemType Directory -Force -Path (Join-Path $bundleDir "images") | Out-Null
Copy-Item -Force $imageTar (Join-Path $bundleDir "images/foundry-images.tar")
if (Test-Path (Join-Path $releaseDir "backup")) {
  Copy-Item -Recurse -Force (Join-Path $releaseDir "backup") (Join-Path $bundleDir "backup")
}

Write-Host "Bundle ready: $bundleDir"

if ($SkipUpload) {
  Write-Host "SkipUpload set. Upload manually:"
  Write-Host "  scp -r $bundleDir\* ${Server}:${RemoteDir}/"
  exit 0
}

$sshArgs = @("-o", "StrictHostKeyChecking=accept-new")
if ($SshKey) { $sshArgs += @("-i", $SshKey) }

Write-Host "==> Uploading to ${Server}:${RemoteDir} ..."
ssh @sshArgs $Server "mkdir -p $RemoteDir"
scp @sshArgs -r "$bundleDir\*" "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) {
  Write-Host @"

上传失败（常见原因：未配置 SSH 密钥）。
请手动执行：
  scp -r `"$bundleDir\*`" ${Server}:${RemoteDir}/
  ssh $Server 'bash $RemoteDir/scripts/cloud-deploy/install-on-server.sh'
"@
  exit 1
}

Write-Host "==> Running remote install..."
ssh @sshArgs $Server "sed -i 's/\r$//' $RemoteDir/scripts/cloud-deploy/*.sh 2>/dev/null; chmod +x $RemoteDir/scripts/cloud-deploy/*.sh"
ssh @sshArgs $Server "chmod +x $RemoteDir/scripts/cloud-deploy/install-on-server.sh && FOUNDRY_ROOT=$RemoteDir bash $RemoteDir/scripts/cloud-deploy/install-on-server.sh"
Write-Host "Deploy finished. Test: https://axislab.top/health"

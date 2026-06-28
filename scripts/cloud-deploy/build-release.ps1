# 构建 foundry/* 生产镜像
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
  [string]$Tag = "latest",
  [string]$PublicOrigin = "https://axislab.top"
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

Write-Host "==> Building foundry images (tag=$Tag, origin=$PublicOrigin)"

$images = @(
  @{ Name = "foundry/api:$Tag"; Dockerfile = "apps/api/Dockerfile" },
  @{ Name = "foundry/gateway:$Tag"; Dockerfile = "apps/gateway/Dockerfile" },
  @{ Name = "foundry/worker:$Tag"; Dockerfile = "apps/worker/Dockerfile" },
  @{ Name = "foundry/webhooks:$Tag"; Dockerfile = "apps/webhooks/Dockerfile" },
  @{ Name = "foundry/logging:$Tag"; Dockerfile = "apps/logging/Dockerfile" }
)

foreach ($img in $images) {
  Write-Host "Building $($img.Name) ..."
  docker build -f $img.Dockerfile -t $img.Name .
  if ($LASTEXITCODE -ne 0) { throw "Build failed: $($img.Name)" }
}

Write-Host "Building foundry/nginx:$Tag ..."
docker build -f infrastructure/nginx/Dockerfile `
  --build-arg VITE_PUBLIC_ORIGIN=$PublicOrigin `
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com `
  -t "foundry/nginx:$Tag" .
if ($LASTEXITCODE -ne 0) { throw "nginx build failed" }

Write-Host "Done. Images:"
docker images "foundry/*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

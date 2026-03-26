# 构建脚本 (PowerShell)
# 用于构建所有服务的 Docker 镜像

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# 配置
$Registry = if ($env:DOCKER_REGISTRY) { $env:DOCKER_REGISTRY } else { "" }
$ImagePrefix = if ($env:IMAGE_PREFIX) { $env:IMAGE_PREFIX } else { "service" }
$Version = if ($env:DOCKER_IMAGE_VERSION) { $env:DOCKER_IMAGE_VERSION } else { "latest" }
$BuildArgs = if ($env:DOCKER_BUILD_ARGS) { $env:DOCKER_BUILD_ARGS } else { "" }

# 服务列表
$Services = @(
    @{ Name = "api"; Path = "apps/api" }
    @{ Name = "gateway"; Path = "apps/gateway" }
    @{ Name = "logging"; Path = "apps/logging" }
    @{ Name = "webhooks"; Path = "apps/webhooks" }
    @{ Name = "worker"; Path = "apps/worker" }
)

Write-Host "🚀 Starting build process..." -ForegroundColor Green
Write-Host "Registry: $($Registry -eq "" ? '<none>' : $Registry)"
Write-Host "Image Prefix: $ImagePrefix"
Write-Host "Version: $Version"
Write-Host ""

# 构建函数
function Build-Service {
    param(
        [string]$ServiceName,
        [string]$ServicePath
    )
    
    $DockerfilePath = Join-Path $ServicePath "Dockerfile"
    
    if (-not (Test-Path $DockerfilePath)) {
        Write-Host "⚠️  Dockerfile not found for $ServiceName, skipping..." -ForegroundColor Yellow
        return
    }
    
    $ImageName = "$ImagePrefix-$ServiceName"
    $FullImageName = "$ImageName`:$Version"
    
    if ($Registry) {
        $FullImageName = "$Registry/$FullImageName"
    }
    
    Write-Host "📦 Building $ServiceName..." -ForegroundColor Green
    Write-Host "  Image: $FullImageName"
    Write-Host "  Dockerfile: $DockerfilePath"
    
    # 构建 Docker 镜像
    $BuildCommand = "docker build -f `"$DockerfilePath`" -t `"$FullImageName`""
    if ($BuildArgs) {
        $BuildCommand += " $BuildArgs"
    }
    $BuildCommand += " `"$ProjectRoot`""
    
    Invoke-Expression $BuildCommand
    
    # 如果指定了 latest 标签，也打上 latest 标签
    if ($Version -ne "latest") {
        $LatestImageName = "$ImageName`:latest"
        if ($Registry) {
            $LatestImageName = "$Registry/$LatestImageName"
        }
        docker tag $FullImageName $LatestImageName
        Write-Host "  ✓ Tagged as $LatestImageName" -ForegroundColor Green
    }
    
    Write-Host "  ✓ Build completed: $FullImageName" -ForegroundColor Green
    Write-Host ""
}

# 构建所有服务
foreach ($Service in $Services) {
    Build-Service -ServiceName $Service.Name -ServicePath $Service.Path
}

Write-Host "✅ All builds completed!" -ForegroundColor Green

# 列出构建的镜像
Write-Host ""
Write-Host "📋 Built images:" -ForegroundColor Green
docker images | Select-String "$ImagePrefix-" | ForEach-Object { Write-Host $_ }































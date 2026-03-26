# 统一服务启动脚本 - Windows PowerShell
# 用于启动所有服务和基础设施

param(
    [Parameter(Position=0)]
    [ValidateSet('dev', 'prod', 'test', 'all')]
    [string]$Environment = 'dev',
    
    [switch]$InfrastructureOnly,
    [switch]$AppsOnly,
    [switch]$LocalDev,
    [switch]$WithConsul,
    [switch]$Help
)

function Show-Help {
    Write-Host @"
统一服务管理脚本 - Windows PowerShell

用法:
    .\scripts\start-services.ps1 [环境] [选项]

环境:
    dev      - 开发环境（默认）
    prod     - 生产环境
    test     - 测试环境
    all      - 启动所有环境

选项:
    -InfrastructureOnly  仅启动基础设施服务（PostgreSQL, Redis, Consul等）
    -AppsOnly           仅启动应用服务（Gateway, API等）
    -LocalDev           启动本地开发服务（会占用较多资源，默认只启动Docker）
    -WithConsul         启动时包含Consul服务发现
    -Help               显示此帮助信息

示例:
    .\scripts\start-services.ps1                    # 启动开发环境（默认）
    .\scripts\start-services.ps1 dev                # 启动开发环境
    .\scripts\start-services.ps1 prod               # 启动生产环境
    .\scripts\start-services.ps1 -InfrastructureOnly # 仅启动基础设施
    .\scripts\start-services.ps1 -AppsOnly          # 仅启动应用服务
    .\scripts\start-services.ps1 -WithConsul        # 启动开发环境并包含Consul

"@
}

function Start-Infrastructure {
    param([string]$Env)
    
    Write-Host "`n🚀 启动基础设施服务 ($Env 环境)..." -ForegroundColor Cyan
    
    $composeFiles = @(
        "deployment/docker/docker-compose.yml"
    )
    
    switch ($Env) {
        'dev' {
            $composeFiles += "deployment/docker/docker-compose.dev.yml"
        }
        'prod' {
            $composeFiles += "deployment/docker/docker-compose.prod.yml"
        }
        'test' {
            $composeFiles += "deployment/docker/docker-compose.test.yml"
        }
    }
    
    $composeArgs = $composeFiles | ForEach-Object { "-f", $_ }
    
    if ($WithConsul) {
        $composeArgs += "--profile", "consul"
        $env:CONSUL_ENABLED = "true"
    }
    
    $composeArgs += "up", "-d"
    
    Push-Location $PSScriptRoot/..
    try {
        & docker-compose @composeArgs
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ 基础设施服务启动成功!" -ForegroundColor Green
        } else {
            Write-Host "❌ 基础设施服务启动失败!" -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Start-Apps {
    param([bool]$LocalMode = $false)
    
    Write-Host "`n🚀 启动应用服务..." -ForegroundColor Cyan
    
    if ($LocalMode) {
        Write-Host "⚠️  警告: 本地开发模式会占用较多资源" -ForegroundColor Yellow
        Write-Host "提示: 如需仅使用 Docker 容器，请使用 -InfrastructureOnly 选项" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
    
    Push-Location $PSScriptRoot/..
    try {
        & pnpm dev
    } finally {
        Pop-Location
    }
}

function Show-Status {
    Write-Host "`n📊 服务状态:" -ForegroundColor Cyan
    Push-Location $PSScriptRoot/..
    try {
        & docker-compose -f deployment/docker/docker-compose.yml ps
    } finally {
        Pop-Location
    }
}

# 主逻辑
if ($Help) {
    Show-Help
    exit 0
}

Write-Host "`n=== 服务启动管理器 ===" -ForegroundColor Yellow
Write-Host "环境: $Environment" -ForegroundColor White

if ($InfrastructureOnly) {
    Start-Infrastructure -Env $Environment
    Show-Status
} elseif ($AppsOnly) {
    Start-Apps -LocalMode $true
} else {
    Start-Infrastructure -Env $Environment
    if ($LocalDev) {
        Start-Sleep -Seconds 3
        Write-Host "`n⏳ 等待基础设施服务就绪..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        Start-Apps -LocalMode $true
    } else {
        Write-Host "`n✅ 已启动 Docker 容器服务" -ForegroundColor Green
        Write-Host "提示: 如需启动本地开发服务，请使用 -LocalDev 选项" -ForegroundColor Yellow
    }
    Show-Status
}

Write-Host "`n✨ 完成!" -ForegroundColor Green












# 统一服务停止脚本 - Windows PowerShell
# 用于停止所有服务和基础设施

param(
    [Parameter(Position=0)]
    [ValidateSet('dev', 'prod', 'test')]
    [string]$Environment = 'dev',
    
    [switch]$InfrastructureOnly,
    [switch]$AppsOnly,
    [switch]$RemoveVolumes,
    [switch]$Help
)

function Show-Help {
    Write-Host @"
统一服务停止脚本 - Windows PowerShell

用法:
    .\scripts\stop-services.ps1 [环境] [选项]

环境:
    dev      - 开发环境（默认）
    prod     - 生产环境
    test     - 测试环境

选项:
    -InfrastructureOnly  仅停止基础设施服务
    -AppsOnly           仅停止应用服务（Ctrl+C）
    -RemoveVolumes      停止时删除数据卷（危险！）
    -Help               显示此帮助信息

示例:
    .\scripts\stop-services.ps1                    # 停止开发环境
    .\scripts\stop-services.ps1 prod               # 停止生产环境
    .\scripts\stop-services.ps1 -InfrastructureOnly # 仅停止基础设施
    .\scripts\stop-services.ps1 -RemoveVolumes     # 停止并删除数据卷

"@
}

function Stop-Infrastructure {
    param([string]$Env, [bool]$RemoveVols)
    
    Write-Host "`n🛑 停止基础设施服务 ($Env 环境)..." -ForegroundColor Cyan
    
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
    $composeArgs += "down"
    
    if ($RemoveVols) {
        $composeArgs += "-v"
        Write-Host "⚠️  警告: 将删除所有数据卷!" -ForegroundColor Red
        $confirm = Read-Host "确认继续? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "已取消" -ForegroundColor Yellow
            exit 0
        }
    }
    
    Push-Location $PSScriptRoot/..
    try {
        & docker-compose @composeArgs
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ 基础设施服务已停止!" -ForegroundColor Green
        } else {
            Write-Host "❌ 停止服务时出错!" -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Stop-Apps {
    Write-Host "`n🛑 停止应用服务..." -ForegroundColor Cyan
    Write-Host "提示: 请使用 Ctrl+C 停止应用服务进程" -ForegroundColor Yellow
}

# 主逻辑
if ($Help) {
    Show-Help
    exit 0
}

Write-Host "`n=== 服务停止管理器 ===" -ForegroundColor Yellow
Write-Host "环境: $Environment" -ForegroundColor White

if ($InfrastructureOnly) {
    Stop-Infrastructure -Env $Environment -RemoveVols $RemoveVolumes
} elseif ($AppsOnly) {
    Stop-Apps
} else {
    Stop-Apps
    Start-Sleep -Seconds 2
    Stop-Infrastructure -Env $Environment -RemoveVols $RemoveVolumes
}

Write-Host "`n✨ 完成!" -ForegroundColor Green




































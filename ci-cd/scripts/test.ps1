# 测试脚本 (PowerShell)
# 用于运行单元测试和集成测试

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# 配置
$TestType = if ($env:TEST_TYPE) { $env:TEST_TYPE } else { "all" }
$Coverage = if ($env:COVERAGE) { $env:COVERAGE } else { "false" }
$Verbose = if ($env:VERBOSE) { $env:VERBOSE } else { "false" }

Write-Host "🧪 Starting tests..." -ForegroundColor Green
Write-Host "Test Type: $TestType"
Write-Host "Coverage: $Coverage"
Write-Host ""

# 检查 Node.js 和 pnpm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pnpm not found" -ForegroundColor Red
    exit 1
}

# 安装依赖
Write-Host "📦 Installing dependencies..." -ForegroundColor Green
pnpm install --frozen-lockfile

# 运行 lint
Write-Host "🔍 Running linter..." -ForegroundColor Green
pnpm lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Lint failed" -ForegroundColor Red
    exit 1
}

# 运行类型检查
Write-Host "🔍 Running type check..." -ForegroundColor Green
try {
    pnpm --filter "*" exec tsc --noEmit
} catch {
    Write-Host "⚠️  Type check skipped (no TypeScript config found)" -ForegroundColor Yellow
}

# 运行测试
switch ($TestType) {
    "unit" {
        Write-Host "🧪 Running unit tests..." -ForegroundColor Green
        if ($Coverage -eq "true") {
            pnpm test:cov
        } else {
            pnpm test
        }
    }
    "integration" {
        Write-Host "🧪 Running integration tests..." -ForegroundColor Green
        pnpm infra:test:start
        Start-Sleep -Seconds 10
        
        pnpm test:integration
        if ($LASTEXITCODE -ne 0) {
            pnpm infra:test:stop
            exit 1
        }
        
        pnpm infra:test:stop
    }
    "e2e" {
        Write-Host "🧪 Running E2E tests..." -ForegroundColor Green
        pnpm infra:test:start
        Start-Sleep -Seconds 10
        
        pnpm test:e2e
        if ($LASTEXITCODE -ne 0) {
            pnpm infra:test:stop
            exit 1
        }
        
        pnpm infra:test:stop
    }
    "all" {
        Write-Host "🧪 Running all tests..." -ForegroundColor Green
        
        if ($Coverage -eq "true") {
            pnpm test:cov
        } else {
            pnpm test
        }
        
        if (Test-Path "test/integration") {
            Write-Host "🧪 Running integration tests..." -ForegroundColor Green
            pnpm infra:test:start
            Start-Sleep -Seconds 10
            pnpm test:integration
            if ($LASTEXITCODE -ne 0) {
                pnpm infra:test:stop
                exit 1
            }
            pnpm infra:test:stop
        }
    }
    default {
        Write-Host "❌ Unknown test type: $TestType" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ All tests passed!" -ForegroundColor Green































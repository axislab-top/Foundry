# Redis Health Check Script for PowerShell
# This script checks if Redis is healthy and responding
# Usage: .\health-check.ps1 [container_name]

param(
    [string]$ContainerName = "redis"
)

$ErrorActionPreference = "Stop"

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Host "FAIL: Container '$ContainerName' is not running." -ForegroundColor Red
    exit 1
}

# Check if Redis is responding to PING
try {
    $pingResult = docker exec $ContainerName redis-cli ping 2>&1
    if ($pingResult -notmatch "PONG") {
        Write-Host "FAIL: Redis is not responding to PING" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "FAIL: Cannot connect to Redis" -ForegroundColor Red
    exit 1
}

# Check if Redis INFO command works
try {
    $infoResult = docker exec $ContainerName redis-cli INFO server 2>&1 | Select-String -Pattern "redis_version"
    if (-not $infoResult) {
        Write-Host "FAIL: Redis INFO command failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "FAIL: Redis INFO command failed" -ForegroundColor Red
    exit 1
}

# Check memory usage (optional warning)
try {
    $memoryInfo = docker exec $ContainerName redis-cli INFO memory 2>&1
    $memoryUsage = ($memoryInfo | Select-String -Pattern "used_memory_human").ToString().Split(':')[1].Trim()
    $maxMemory = ($memoryInfo | Select-String -Pattern "maxmemory_human").ToString().Split(':')[1].Trim()
    
    Write-Host "OK: Redis is healthy" -ForegroundColor Green
    Write-Host "Memory usage: $memoryUsage"
    if ($maxMemory -ne "0B") {
        Write-Host "Max memory: $maxMemory"
    }
} catch {
    Write-Host "OK: Redis is healthy (cannot retrieve memory info)" -ForegroundColor Green
}

exit 0













































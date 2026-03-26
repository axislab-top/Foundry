# Redis Flush Script for PowerShell
# WARNING: This script clears ALL data from Redis!
# Usage: .\flush.ps1 [container_name] [db_number]
# Example: .\flush.ps1 redis 0

param(
    [string]$ContainerName = "redis",
    [int]$DbNumber = 0
)

$ErrorActionPreference = "Stop"

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Host "Error: Container '$ContainerName' is not running." -ForegroundColor Red
    exit 1
}

Write-Host "==========================================" -ForegroundColor Red
Write-Host "WARNING: This will DELETE ALL DATA from Redis database $DbNumber!" -ForegroundColor Red
Write-Host "Container: $ContainerName"
Write-Host "Database: $DbNumber"
Write-Host "==========================================" -ForegroundColor Red
Write-Host ""
$confirmation = Read-Host "Type 'FLUSH' to confirm"
if ($confirmation -ne "FLUSH") {
    Write-Host "Operation cancelled"
    exit 0
}

# Select database and flush
Write-Host "Flushing database $DbNumber..."
docker exec $ContainerName redis-cli -n $DbNumber FLUSHDB | Out-Null

Write-Host "Database $DbNumber flushed successfully" -ForegroundColor Green

# Optional: Show remaining keys (should be 0)
$keyCount = docker exec $ContainerName redis-cli -n $DbNumber DBSIZE
Write-Host "Remaining keys in database $DbNumber: $keyCount"













































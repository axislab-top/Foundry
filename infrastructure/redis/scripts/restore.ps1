# Redis Restore Script for PowerShell
# This script restores Redis from RDB or AOF backup
# Usage: .\restore.ps1 <backup_directory> [container_name]
# Example: .\restore.ps1 .\data\backup_20240101_120000 redis

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupDir,
    
    [string]$ContainerName = "redis"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir -PathType Container)) {
    Write-Host "Error: Backup directory '$BackupDir' does not exist" -ForegroundColor Red
    exit 1
}

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Host "Error: Container '$ContainerName' is not running." -ForegroundColor Red
    exit 1
}

Write-Host "WARNING: This will overwrite existing Redis data!" -ForegroundColor Yellow
Write-Host "Container: $ContainerName"
Write-Host "Backup directory: $BackupDir"
$confirmation = Read-Host "Are you sure you want to continue? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "Restore cancelled"
    exit 0
}

# Stop Redis to ensure data consistency
Write-Host "Stopping Redis writes..."
docker exec $ContainerName redis-cli CONFIG SET appendonly no 2>&1 | Out-Null
Start-Sleep -Seconds 1
docker exec $ContainerName redis-cli SHUTDOWN SAVE 2>&1 | Out-Null
Start-Sleep -Seconds 2

# Start container if it stopped
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Host "Container stopped. Starting container..."
    docker start $ContainerName | Out-Null
    Start-Sleep -Seconds 3
}

# Copy RDB file if exists
$rdbFile = Join-Path $BackupDir "dump.rdb"
if (Test-Path $rdbFile) {
    Write-Host "Restoring RDB file..."
    docker cp "${rdbFile}" "${ContainerName}:/data/dump.rdb"
    Write-Host "RDB restore completed"
}

# Copy AOF file if exists
$aofFile = Join-Path $BackupDir "appendonly.aof"
if (Test-Path $aofFile) {
    Write-Host "Restoring AOF file..."
    docker cp "${aofFile}" "${ContainerName}:/data/appendonly.aof"
    Write-Host "AOF restore completed"
}

# Restart Redis to load restored data
Write-Host "Restarting Redis to load restored data..."
docker restart $ContainerName | Out-Null

Write-Host "Waiting for Redis to be ready..."
Start-Sleep -Seconds 5

# Verify Redis is running
$pingResult = docker exec $ContainerName redis-cli ping 2>&1
if ($pingResult -match "PONG") {
    Write-Host "Restore completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Error: Redis is not responding after restore" -ForegroundColor Red
    exit 1
}













































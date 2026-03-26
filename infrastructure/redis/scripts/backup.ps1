# Redis Backup Script for PowerShell
# This script backs up RDB and AOF files from Redis container
# Usage: .\backup.ps1 [container_name]

param(
    [string]$ContainerName = "redis"
)

$ErrorActionPreference = "Stop"

# Configuration
$BackupDir = if ($env:REDIS_BACKUP_DIR) { $env:REDIS_BACKUP_DIR } else { "./data" }
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupSubdir = Join-Path $BackupDir "backup_$Timestamp"
$RetentionDays = if ($env:REDIS_BACKUP_RETENTION_DAYS) { [int]$env:REDIS_BACKUP_RETENTION_DAYS } else { 7 }

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Host "Error: Container '$ContainerName' is not running." -ForegroundColor Red
    exit 1
}

Write-Host "Backing up Redis data from container: $ContainerName"
Write-Host "Backup directory: $BackupSubdir"

# Create backup directory
New-Item -ItemType Directory -Path $BackupSubdir -Force | Out-Null

# Trigger RDB snapshot (SAVE command - blocking)
Write-Host "Creating RDB snapshot..."
docker exec $ContainerName redis-cli SAVE | Out-Null

# Copy RDB file if exists
$rdbExists = docker exec $ContainerName test -f /data/dump.rdb 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Copying RDB file..."
    docker cp "${ContainerName}:/data/dump.rdb" "$BackupSubdir/dump.rdb"
    Write-Host "RDB backup completed"
} else {
    Write-Host "Warning: RDB file not found" -ForegroundColor Yellow
}

# Copy AOF file if exists
$aofExists = docker exec $ContainerName test -f /data/appendonly.aof 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Copying AOF file..."
    docker cp "${ContainerName}:/data/appendonly.aof" "$BackupSubdir/appendonly.aof"
    Write-Host "AOF backup completed"
} else {
    Write-Host "Info: AOF file not found (AOF may not be enabled)" -ForegroundColor Cyan
}

# Get backup size
$backupSize = (Get-ChildItem $BackupSubdir -Recurse | Measure-Object -Property Length -Sum).Sum
$backupSizeMB = [math]::Round($backupSize / 1MB, 2)
Write-Host "Backup completed: $BackupSubdir"
Write-Host "Backup size: $backupSizeMB MB"

# Optional: Remove backups older than retention days
if ($RetentionDays -gt 0) {
    Write-Host "Cleaning up backups older than $RetentionDays days..."
    $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem $BackupDir -Directory -Filter "backup_*" | 
        Where-Object { $_.LastWriteTime -lt $cutoffDate } | 
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Cleanup completed"
}

Write-Host "Backup process finished successfully" -ForegroundColor Green













































# PostgreSQL Backup Script for Docker (Windows PowerShell)
# This script uses docker exec to backup the database, no need to install PostgreSQL client tools on host
# Usage: .\backup-docker.ps1 [database_name] [container_name]

param(
    [string]$DatabaseName = $env:POSTGRES_DB,
    [string]$ContainerName = "service-postgres"
)

if (-not $DatabaseName) {
    $DatabaseName = "service_db"
}

$DB_USER = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
$BACKUP_DIR = "/backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = "$BACKUP_DIR/${DatabaseName}_${TIMESTAMP}.dump"
$BACKUP_FILE_GZ = "$BACKUP_FILE.gz"

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^${ContainerName}$"
if (-not $containerExists) {
    Write-Host "Error: Container '${ContainerName}' is not running." -ForegroundColor Red
    exit 1
}

Write-Host "Backing up database: $DatabaseName"
Write-Host "Container: $ContainerName"
Write-Host "User: $DB_USER"

# Perform backup using docker exec
docker exec $ContainerName pg_dump -U $DB_USER -d $DatabaseName -F c -f $BACKUP_FILE

if ($LASTEXITCODE -eq 0) {
    # Compress backup
    docker exec $ContainerName gzip $BACKUP_FILE
    
    # Get backup size
    $backupSizeBytes = docker exec $ContainerName stat -c%s $BACKUP_FILE_GZ 2>$null
    if (-not $backupSizeBytes) {
        # Fallback: use wc -c if stat is not available
        $backupSizeBytes = docker exec $ContainerName sh -c "wc -c < $BACKUP_FILE_GZ"
    }
    $backupSizeMB = [math]::Round([int]$backupSizeBytes / 1MB, 2)
    
    Write-Host "Backup completed: $BACKUP_FILE_GZ" -ForegroundColor Green
    Write-Host "Backup size: $backupSizeMB MB"
    
    # Remove backups older than 30 days (inside container)
    docker exec $ContainerName find $BACKUP_DIR -name "*.dump.gz" -mtime +30 -delete 2>$null
    
    Write-Host "Backup file location in container: $BACKUP_FILE_GZ"
    Write-Host "Backup file location on host: infrastructure/postgres/backups/$(Split-Path -Leaf $BACKUP_FILE_GZ)"
} else {
    Write-Host "Backup failed!" -ForegroundColor Red
    exit 1
}















































# PostgreSQL Restore Script for Docker (Windows PowerShell)
# This script uses docker exec to restore the database from backup
# Usage: .\restore-docker.ps1 <backup_file> [database_name] [container_name]

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$DatabaseName = $env:POSTGRES_DB,
    [string]$ContainerName = "service-postgres"
)

if (-not $DatabaseName) {
    $DatabaseName = "service_db"
}

$DB_USER = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
$BACKUP_DIR = "/backups"

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^${ContainerName}$"
if (-not $containerExists) {
    Write-Host "Error: Container '${ContainerName}' is not running." -ForegroundColor Red
    exit 1
}

# Convert relative path to absolute path for container
if (-not $BackupFile.StartsWith("/")) {
    # Relative path - assume it's in backups directory
    $backupFileName = Split-Path -Leaf $BackupFile
    $BACKUP_FILE_CONTAINER = "$BACKUP_DIR/$backupFileName"
} else {
    $BACKUP_FILE_CONTAINER = $BackupFile
}

# Check if backup file exists in container
$fileExists = docker exec $ContainerName test -f $BACKUP_FILE_CONTAINER
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Backup file not found in container: $BACKUP_FILE_CONTAINER" -ForegroundColor Red
    Write-Host "Make sure the backup file is in the backups directory (infrastructure/postgres/backups/)" -ForegroundColor Yellow
    exit 1
}

# Confirm restore
$confirm = Read-Host "Are you sure you want to restore database '$DatabaseName' from '$BACKUP_FILE_CONTAINER'? This will overwrite existing data. (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Restore cancelled."
    exit 0
}

Write-Host "Restoring database: $DatabaseName"
Write-Host "Backup file: $BACKUP_FILE_CONTAINER"
Write-Host "Container: $ContainerName"
Write-Host "User: $DB_USER"

# Check if file is compressed
if ($BACKUP_FILE_CONTAINER.EndsWith(".gz")) {
    # Restore from compressed backup
    docker exec $ContainerName sh -c "gunzip -c $BACKUP_FILE_CONTAINER | pg_restore -U $DB_USER -d $DatabaseName --clean --if-exists"
} else {
    # Restore from uncompressed backup
    docker exec $ContainerName pg_restore -U $DB_USER -d $DatabaseName --clean --if-exists $BACKUP_FILE_CONTAINER
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "Restore completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Restore failed!" -ForegroundColor Red
    exit 1
}















































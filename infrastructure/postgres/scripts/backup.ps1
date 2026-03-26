# PostgreSQL Backup Script for Windows PowerShell
# Usage: .\backup.ps1 [database_name]

param(
    [string]$DatabaseName = $env:POSTGRES_DB
)

if (-not $DatabaseName) {
    $DatabaseName = "service_db"
}

$DB_HOST = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "localhost" }
$DB_PORT = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }
$DB_USER = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }
$DB_PASSWORD = $env:POSTGRES_PASSWORD

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKUP_DIR = Join-Path $ScriptDir "..\backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = Join-Path $BACKUP_DIR "${DatabaseName}_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

# Set password environment variable for pg_dump
$env:PGPASSWORD = $DB_PASSWORD

Write-Host "Backing up database: $DatabaseName"
Write-Host "Host: ${DB_HOST}:${DB_PORT}"
Write-Host "User: $DB_USER"

# Perform backup
& pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DatabaseName -F c -f $BACKUP_FILE

if ($LASTEXITCODE -eq 0) {
    # Compress backup using PowerShell
    $BACKUP_FILE_GZ = "$BACKUP_FILE.gz"
    $content = [System.IO.File]::ReadAllBytes($BACKUP_FILE)
    $compressed = [System.IO.Compression.GZipStream]::new(
        [System.IO.File]::Create($BACKUP_FILE_GZ),
        [System.IO.Compression.CompressionLevel]::Optimal
    )
    $compressed.Write($content, 0, $content.Length)
    $compressed.Close()
    Remove-Item $BACKUP_FILE
    
    $fileSize = (Get-Item $BACKUP_FILE_GZ).Length / 1MB
    Write-Host "Backup completed: $BACKUP_FILE_GZ"
    Write-Host "Backup size: $([math]::Round($fileSize, 2)) MB"
    
    # Remove backups older than 30 days
    Get-ChildItem -Path $BACKUP_DIR -Filter "*.sql.gz" | 
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | 
        Remove-Item
} else {
    Write-Host "Backup failed!" -ForegroundColor Red
    exit 1
}

# Clear password from environment
Remove-Item Env:\PGPASSWORD















































#!/bin/bash

# PostgreSQL Backup Script
# Usage: ./backup.sh [database_name]

set -e

# Configuration
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${1:-${POSTGRES_DB:-service_db}}"
BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Perform backup
echo "Backing up database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "User: ${DB_USER}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${BACKUP_FILE}"

# Compress backup
gzip "${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE_GZ}"
echo "Backup size: $(du -h "${BACKUP_FILE_GZ}" | cut -f1)"

# Optional: Remove backups older than 30 days
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +30 -delete















































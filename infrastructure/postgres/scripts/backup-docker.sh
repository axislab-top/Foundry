#!/bin/bash

# PostgreSQL Backup Script for Docker
# This script uses docker exec to backup the database, no need to install PostgreSQL client tools on host
# Usage: ./backup-docker.sh [database_name] [container_name]

set -e

# Configuration
CONTAINER_NAME="${2:-service-postgres}"
DB_NAME="${1:-${POSTGRES_DB:-service_db}}"
DB_USER="${POSTGRES_USER:-postgres}"
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

echo "Backing up database: ${DB_NAME}"
echo "Container: ${CONTAINER_NAME}"
echo "User: ${DB_USER}"

# Perform backup using docker exec
# Using custom format (-F c) for better compression and faster restore
docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${BACKUP_FILE}"

# Compress backup
docker exec "${CONTAINER_NAME}" gzip "${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE_GZ}"

# Get backup size
BACKUP_SIZE=$(docker exec "${CONTAINER_NAME}" sh -c "wc -c < ${BACKUP_FILE_GZ}" | tr -d ' ')
BACKUP_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", ${BACKUP_SIZE}/1024/1024}")
echo "Backup size: ${BACKUP_SIZE_MB} MB"

# Optional: Remove backups older than 30 days (inside container)
docker exec "${CONTAINER_NAME}" find "${BACKUP_DIR}" -name "*.dump.gz" -mtime +30 -delete 2>/dev/null || true

echo "Backup file location in container: ${BACKUP_FILE_GZ}"
echo "Backup file location on host: infrastructure/postgres/backups/$(basename ${BACKUP_FILE_GZ})"


#!/bin/bash

# Redis Backup Script
# This script backs up RDB and AOF files from Redis container
# Usage: ./backup.sh [container_name]

set -e

# Configuration
CONTAINER_NAME="${1:-redis}"
BACKUP_DIR="${REDIS_BACKUP_DIR:-./data}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_SUBDIR="${BACKUP_DIR}/backup_${TIMESTAMP}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

echo "Backing up Redis data from container: ${CONTAINER_NAME}"
echo "Backup directory: ${BACKUP_SUBDIR}"

# Create backup directory
mkdir -p "${BACKUP_SUBDIR}"

# Trigger RDB snapshot (SAVE command - blocking)
echo "Creating RDB snapshot..."
docker exec "${CONTAINER_NAME}" redis-cli SAVE

# Copy RDB file if exists
if docker exec "${CONTAINER_NAME}" test -f /data/dump.rdb; then
    echo "Copying RDB file..."
    docker cp "${CONTAINER_NAME}:/data/dump.rdb" "${BACKUP_SUBDIR}/dump.rdb"
    echo "RDB backup completed"
else
    echo "Warning: RDB file not found"
fi

# Copy AOF file if exists
if docker exec "${CONTAINER_NAME}" test -f /data/appendonly.aof; then
    echo "Copying AOF file..."
    docker cp "${CONTAINER_NAME}:/data/appendonly.aof" "${BACKUP_SUBDIR}/appendonly.aof"
    echo "AOF backup completed"
else
    echo "Info: AOF file not found (AOF may not be enabled)"
fi

# Get backup size
BACKUP_SIZE=$(du -sh "${BACKUP_SUBDIR}" | cut -f1)
echo "Backup completed: ${BACKUP_SUBDIR}"
echo "Backup size: ${BACKUP_SIZE}"

# Optional: Remove backups older than retention days
RETENTION_DAYS="${REDIS_BACKUP_RETENTION_DAYS:-7}"
if [ -n "${RETENTION_DAYS}" ] && [ "${RETENTION_DAYS}" -gt 0 ]; then
    echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
    find "${BACKUP_DIR}" -type d -name "backup_*" -mtime +${RETENTION_DAYS} -exec rm -rf {} + 2>/dev/null || true
    echo "Cleanup completed"
fi

echo "Backup process finished successfully"













































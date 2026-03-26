#!/bin/bash

# PostgreSQL Restore Script for Docker
# This script uses docker exec to restore the database from backup
# Usage: ./restore-docker.sh <backup_file> [database_name] [container_name]

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file> [database_name] [container_name]"
    echo "Example: $0 backups/service_db_20240101_120000.dump.gz"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${2:-${POSTGRES_DB:-service_db}}"
CONTAINER_NAME="${3:-service-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

# Convert relative path to absolute path for container
if [[ "${BACKUP_FILE}" != /* ]]; then
    # Relative path - assume it's in backups directory
    BACKUP_FILE_CONTAINER="/backups/$(basename ${BACKUP_FILE})"
else
    BACKUP_FILE_CONTAINER="${BACKUP_FILE}"
fi

# Check if backup file exists in container
if ! docker exec "${CONTAINER_NAME}" test -f "${BACKUP_FILE_CONTAINER}"; then
    echo "Error: Backup file not found in container: ${BACKUP_FILE_CONTAINER}"
    echo "Make sure the backup file is in the backups directory (infrastructure/postgres/backups/)"
    exit 1
fi

# Confirm restore
read -p "Are you sure you want to restore database '${DB_NAME}' from '${BACKUP_FILE_CONTAINER}'? This will overwrite existing data. (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo "Restoring database: ${DB_NAME}"
echo "Backup file: ${BACKUP_FILE_CONTAINER}"
echo "Container: ${CONTAINER_NAME}"
echo "User: ${DB_USER}"

# Check if file is compressed
if [[ "${BACKUP_FILE_CONTAINER}" == *.gz ]]; then
    # Restore from compressed backup
    docker exec "${CONTAINER_NAME}" sh -c "gunzip -c ${BACKUP_FILE_CONTAINER} | pg_restore -U ${DB_USER} -d ${DB_NAME} --clean --if-exists"
else
    # Restore from uncompressed backup
    docker exec "${CONTAINER_NAME}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists "${BACKUP_FILE_CONTAINER}"
fi

echo "Restore completed successfully!"















































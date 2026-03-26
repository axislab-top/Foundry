#!/bin/bash

# PostgreSQL Restore Script
# Usage: ./restore.sh <backup_file> [database_name]

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file> [database_name]"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${2:-${POSTGRES_DB:-service_db}}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Confirm restore
read -p "Are you sure you want to restore database '${DB_NAME}' from '${BACKUP_FILE}'? This will overwrite existing data. (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo "Restoring database: ${DB_NAME}"
echo "Backup file: ${BACKUP_FILE}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "User: ${DB_USER}"

# Check if file is compressed
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    # Restore from compressed backup
    gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists
else
    # Restore from uncompressed backup
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists "${BACKUP_FILE}"
fi

echo "Restore completed successfully!"















































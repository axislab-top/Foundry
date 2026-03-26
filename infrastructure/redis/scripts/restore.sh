#!/bin/bash

# Redis Restore Script
# This script restores Redis from RDB or AOF backup
# Usage: ./restore.sh <backup_directory> [container_name]
# Example: ./restore.sh ./data/backup_20240101_120000 redis

set -e

# Configuration
BACKUP_DIR="${1}"
CONTAINER_NAME="${2:-redis}"

if [ -z "${BACKUP_DIR}" ]; then
    echo "Error: Backup directory is required"
    echo "Usage: $0 <backup_directory> [container_name]"
    exit 1
fi

if [ ! -d "${BACKUP_DIR}" ]; then
    echo "Error: Backup directory '${BACKUP_DIR}' does not exist"
    exit 1
fi

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

echo "WARNING: This will overwrite existing Redis data!"
echo "Container: ${CONTAINER_NAME}"
echo "Backup directory: ${BACKUP_DIR}"
read -p "Are you sure you want to continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

# Stop Redis to ensure data consistency
echo "Stopping Redis writes..."
docker exec "${CONTAINER_NAME}" redis-cli CONFIG SET appendonly no 2>/dev/null || true
docker exec "${CONTAINER_NAME}" redis-cli SHUTDOWN SAVE 2>/dev/null || true

# Wait for container to stop
sleep 2

# Start container if it stopped
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Container stopped. Starting container..."
    docker start "${CONTAINER_NAME}"
    sleep 3
fi

# Copy RDB file if exists
if [ -f "${BACKUP_DIR}/dump.rdb" ]; then
    echo "Restoring RDB file..."
    docker cp "${BACKUP_DIR}/dump.rdb" "${CONTAINER_NAME}:/data/dump.rdb"
    echo "RDB restore completed"
fi

# Copy AOF file if exists
if [ -f "${BACKUP_DIR}/appendonly.aof" ]; then
    echo "Restoring AOF file..."
    docker cp "${BACKUP_DIR}/appendonly.aof" "${CONTAINER_NAME}:/data/appendonly.aof"
    echo "AOF restore completed"
fi

# Restart Redis to load restored data
echo "Restarting Redis to load restored data..."
docker restart "${CONTAINER_NAME}"

echo "Waiting for Redis to be ready..."
sleep 5

# Verify Redis is running
if docker exec "${CONTAINER_NAME}" redis-cli ping | grep -q "PONG"; then
    echo "Restore completed successfully!"
else
    echo "Error: Redis is not responding after restore"
    exit 1
fi













































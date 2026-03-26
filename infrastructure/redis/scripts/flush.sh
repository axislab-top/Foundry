#!/bin/bash

# Redis Flush Script
# WARNING: This script clears ALL data from Redis!
# Usage: ./flush.sh [container_name] [db_number]
# Example: ./flush.sh redis 0

set -e

CONTAINER_NAME="${1:-redis}"
DB_NUMBER="${2:-0}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

echo "=========================================="
echo "WARNING: This will DELETE ALL DATA from Redis database ${DB_NUMBER}!"
echo "Container: ${CONTAINER_NAME}"
echo "Database: ${DB_NUMBER}"
echo "=========================================="
echo ""
read -p "Type 'FLUSH' to confirm: " -r
if [[ ! $REPLY = "FLUSH" ]]; then
    echo "Operation cancelled"
    exit 0
fi

# Select database and flush
echo "Flushing database ${DB_NUMBER}..."
docker exec "${CONTAINER_NAME}" redis-cli -n "${DB_NUMBER}" FLUSHDB

echo "Database ${DB_NUMBER} flushed successfully"

# Optional: Show remaining keys (should be 0)
KEY_COUNT=$(docker exec "${CONTAINER_NAME}" redis-cli -n "${DB_NUMBER}" DBSIZE)
echo "Remaining keys in database ${DB_NUMBER}: ${KEY_COUNT}"













































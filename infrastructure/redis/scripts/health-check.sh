#!/bin/bash

# Redis Health Check Script
# This script checks if Redis is healthy and responding
# Usage: ./health-check.sh [container_name]

CONTAINER_NAME="${1:-redis}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "FAIL: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

# Check if Redis is responding to PING
PING_RESULT=$(docker exec "${CONTAINER_NAME}" redis-cli ping 2>/dev/null)
if [ "$PING_RESULT" != "PONG" ]; then
    echo "FAIL: Redis is not responding to PING"
    exit 1
fi

# Check if Redis INFO command works
INFO_RESULT=$(docker exec "${CONTAINER_NAME}" redis-cli INFO server 2>/dev/null | grep -c "redis_version" || echo "0")
if [ "$INFO_RESULT" -eq 0 ]; then
    echo "FAIL: Redis INFO command failed"
    exit 1
fi

# Check memory usage (optional warning)
MEMORY_USAGE=$(docker exec "${CONTAINER_NAME}" redis-cli INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r\n')
MAXMEMORY=$(docker exec "${CONTAINER_NAME}" redis-cli INFO memory 2>/dev/null | grep "maxmemory_human" | cut -d: -f2 | tr -d '\r\n')

echo "OK: Redis is healthy"
echo "Memory usage: ${MEMORY_USAGE}"
if [ "${MAXMEMORY}" != "0B" ]; then
    echo "Max memory: ${MAXMEMORY}"
fi

exit 0













































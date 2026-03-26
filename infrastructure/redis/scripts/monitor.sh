#!/bin/bash

# Redis Monitor Script
# This script monitors Redis performance and statistics
# Usage: ./monitor.sh [container_name]

CONTAINER_NAME="${1:-redis}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    exit 1
fi

echo "=========================================="
echo "Redis Monitor - ${CONTAINER_NAME}"
echo "=========================================="
echo ""

# Basic Info
echo "=== Server Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO server | grep -E "redis_version|os|arch_bits|process_id|uptime_in_seconds|uptime_in_days"
echo ""

# Memory Info
echo "=== Memory Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO memory | grep -E "used_memory_human|used_memory_peak_human|maxmemory_human|mem_fragmentation_ratio"
echo ""

# Stats Info
echo "=== Statistics ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO stats | grep -E "total_connections_received|total_commands_processed|instantaneous_ops_per_sec|keyspace_hits|keyspace_misses"
echo ""

# Clients Info
echo "=== Clients Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO clients | grep -E "connected_clients|blocked_clients"
echo ""

# Keyspace Info
echo "=== Keyspace Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO keyspace
echo ""

# Persistence Info
echo "=== Persistence Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO persistence | grep -E "rdb_changes_since_last_save|rdb_last_save_time|aof_enabled|aof_rewrite_in_progress"
echo ""

# Replication Info
echo "=== Replication Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO replication | grep -E "role|connected_slaves|master_repl_offset"
echo ""

# CPU Info
echo "=== CPU Info ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO cpu | grep -E "used_cpu_sys|used_cpu_user|used_cpu_sys_children|used_cpu_user_children"
echo ""

# Command Stats (top commands)
echo "=== Top Commands ==="
docker exec "${CONTAINER_NAME}" redis-cli INFO commandstats | head -20
echo ""

# Slow Log
echo "=== Slow Log (last 10 entries) ==="
docker exec "${CONTAINER_NAME}" redis-cli SLOWLOG GET 10
echo ""

echo "=========================================="
echo "Monitor completed"
echo "=========================================="













































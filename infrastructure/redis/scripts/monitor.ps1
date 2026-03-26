# Redis Monitor Script for PowerShell
# This script monitors Redis performance and statistics
# Usage: .\monitor.ps1 [container_name]

param(
    [string]$ContainerName = "redis"
)

$ErrorActionPreference = "Continue"

# Check if container is running
$containerExists = docker ps --format '{{.Names}}' | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Host "Error: Container '$ContainerName' is not running." -ForegroundColor Red
    exit 1
}

Write-Host "=========================================="
Write-Host "Redis Monitor - $ContainerName"
Write-Host "=========================================="
Write-Host ""

# Basic Info
Write-Host "=== Server Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO server | Select-String -Pattern "redis_version|os|arch_bits|process_id|uptime_in_seconds|uptime_in_days"
Write-Host ""

# Memory Info
Write-Host "=== Memory Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO memory | Select-String -Pattern "used_memory_human|used_memory_peak_human|maxmemory_human|mem_fragmentation_ratio"
Write-Host ""

# Stats Info
Write-Host "=== Statistics ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO stats | Select-String -Pattern "total_connections_received|total_commands_processed|instantaneous_ops_per_sec|keyspace_hits|keyspace_misses"
Write-Host ""

# Clients Info
Write-Host "=== Clients Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO clients | Select-String -Pattern "connected_clients|blocked_clients"
Write-Host ""

# Keyspace Info
Write-Host "=== Keyspace Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO keyspace
Write-Host ""

# Persistence Info
Write-Host "=== Persistence Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO persistence | Select-String -Pattern "rdb_changes_since_last_save|rdb_last_save_time|aof_enabled|aof_rewrite_in_progress"
Write-Host ""

# Replication Info
Write-Host "=== Replication Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO replication | Select-String -Pattern "role|connected_slaves|master_repl_offset"
Write-Host ""

# CPU Info
Write-Host "=== CPU Info ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO cpu | Select-String -Pattern "used_cpu_sys|used_cpu_user|used_cpu_sys_children|used_cpu_user_children"
Write-Host ""

# Command Stats (top commands)
Write-Host "=== Top Commands ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli INFO commandstats | Select-Object -First 20
Write-Host ""

# Slow Log
Write-Host "=== Slow Log (last 10 entries) ===" -ForegroundColor Cyan
docker exec $ContainerName redis-cli SLOWLOG GET 10
Write-Host ""

Write-Host "=========================================="
Write-Host "Monitor completed"
Write-Host "=========================================="













































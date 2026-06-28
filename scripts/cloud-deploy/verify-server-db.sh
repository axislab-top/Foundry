#!/usr/bin/env bash
set -euo pipefail

PG=service-postgres-prod

echo "=== backup files ==="
ls -lh /opt/foundry/backup/ 2>/dev/null || true

echo ""
echo "=== containers ==="
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo "=== databases ==="
sudo docker exec "$PG" psql -U postgres -tAc "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;"

echo ""
echo "=== service_db table counts ==="
sudo docker exec "$PG" psql -U postgres -d service_db -c "\dt" 2>/dev/null | head -30 || echo "service_db missing or no tables"

for tbl in companies users agents admin_users chat_rooms llm_providers marketplace_agents; do
  cnt=$(sudo docker exec "$PG" psql -U postgres -d service_db -tAc "SELECT count(*) FROM ${tbl};" 2>/dev/null || echo "ERR")
  echo "${tbl}: ${cnt}"
done

echo ""
echo "=== gateway_db table counts ==="
for tbl in companies users; do
  cnt=$(sudo docker exec "$PG" psql -U postgres -d gateway_db -tAc "SELECT count(*) FROM ${tbl};" 2>/dev/null || echo "ERR")
  echo "gateway.${tbl}: ${cnt}"
done

echo ""
echo "=== api storage file count ==="
sudo docker exec service-api-prod sh -c 'find /app/storage -type f 2>/dev/null | wc -l' || echo "api container missing"

#!/usr/bin/env bash
set -euo pipefail
cd /opt/foundry

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo docker); fi

PG=service-postgres-prod
DUMP=backup/foundry-db.dump

echo "==> Dump size: $(ls -lh "$DUMP" | awk '{print $5}')"
echo "==> Restoring service_db (this may take 1-2 min)..."
"${DOCKER[@]}" exec -i "$PG" pg_restore -U postgres -d service_db --clean --if-exists --no-owner --no-acl \
  < "$DUMP" || echo "WARN: pg_restore finished with warnings (often normal)"

echo "==> Row counts:"
for tbl in companies users agents chat_rooms; do
  cnt=$("${DOCKER[@]}" exec "$PG" psql -U postgres -d service_db -tAc "SELECT count(*) FROM ${tbl};")
  echo "  ${tbl}: ${cnt}"
done
echo "DONE"

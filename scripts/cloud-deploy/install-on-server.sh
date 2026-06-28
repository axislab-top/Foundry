#!/usr/bin/env bash
# Foundry 腾讯云服务器端安装/恢复/启动
set -euo pipefail

FOUNDRY_ROOT="${FOUNDRY_ROOT:-/opt/foundry}"
cd "$FOUNDRY_ROOT"

echo "==> Foundry install @ $FOUNDRY_ROOT"

DOCKER=(docker)
COMPOSE=(docker compose)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
  COMPOSE=(sudo docker compose)
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker "$USER" 2>/dev/null || true
fi

if ! "${COMPOSE[@]}" version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin required"
  exit 1
fi

SSL_CERT="infrastructure/nginx/ssl/cert.pem"
SSL_KEY="infrastructure/nginx/ssl/key.pem"
if [[ ! -f "$SSL_CERT" || ! -f "$SSL_KEY" ]]; then
  echo "ERROR: SSL not found. Place cert.pem and key.pem in infrastructure/nginx/ssl/"
  exit 1
fi
chmod 600 "$SSL_KEY" 2>/dev/null || true

if [[ -f images/foundry-images.tar ]]; then
  echo "==> Pre-load cleanup (remove old tars & dangling images)"
  if [[ -f scripts/cloud-deploy/cleanup-server-before-rebuild.sh ]]; then
    bash scripts/cloud-deploy/cleanup-server-before-rebuild.sh
  else
    rm -f /tmp/foundry-*.tar /tmp/gateway-flat.tar 2>/dev/null || true
    "${DOCKER[@]}" image prune -f 2>/dev/null || true
    "${DOCKER[@]}" builder prune -a -f 2>/dev/null || true
  fi
  echo "==> Loading Docker images..."
  "${DOCKER[@]}" load -i images/foundry-images.tar
  echo "==> Remove image tar to save disk"
  rm -f images/foundry-images.tar
fi

COMPOSE_FILES=(
  -f deployment/cloud/tencent-lighthouse/compose.standalone.yml
)

echo "==> Starting infrastructure (postgres redis rabbitmq)..."
"${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up -d postgres redis rabbitmq
sleep 15

PG_CONTAINER="service-postgres-prod"
for i in $(seq 1 30); do
  if "${DOCKER[@]}" exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ -f backup/foundry-db.dump ]]; then
  echo "==> Restoring service_db..."
  # 先删库再建库，避免 --clean 因外键无法 DROP 导致半恢复
  "${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='service_db' AND pid <> pg_backend_pid();" 2>/dev/null || true
  "${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS service_db;"
  "${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -c "CREATE DATABASE service_db;"
  "${DOCKER[@]}" exec -i "$PG_CONTAINER" pg_restore -U postgres -d service_db --no-owner --no-acl \
    < backup/foundry-db.dump || echo "WARN: service_db restore had warnings (may be ok)"
fi

if [[ -f backup/foundry-gateway-db.dump ]]; then
  echo "==> Restoring gateway_db..."
  "${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='gateway_db' AND pid <> pg_backend_pid();" 2>/dev/null || true
  "${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS gateway_db;"
  "${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -c "CREATE DATABASE gateway_db;"
  "${DOCKER[@]}" exec -i "$PG_CONTAINER" pg_restore -U postgres -d gateway_db --no-owner --no-acl \
    < backup/foundry-gateway-db.dump || echo "WARN: gateway_db restore had warnings"
fi

echo "==> Starting all services..."
"${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up -d

if [[ -d backup/api-storage ]]; then
  echo "==> Restoring API storage..."
  "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up -d api-service
  sleep 5
  "${DOCKER[@]}" cp backup/api-storage/. service-api-prod:/app/storage/ || true
fi

echo "==> Waiting for nginx health..."
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1/health >/dev/null 2>&1; then
    echo "OK: http://127.0.0.1/health"
    break
  fi
  sleep 3
done

"${COMPOSE[@]}" "${COMPOSE_FILES[@]}" ps
echo ""
echo "Done. Open https://axislab.top"

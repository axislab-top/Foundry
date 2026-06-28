#!/usr/bin/env bash
set -euo pipefail
FOUNDRY_ROOT="${FOUNDRY_ROOT:-/opt/foundry}"
ENV_FILE="$FOUNDRY_ROOT/deployment/docker/.env"
NEW_PASS="eicydkiarngvccgd"

cd "$FOUNDRY_ROOT"

DOCKER=(docker)
COMPOSE=(docker compose)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
  COMPOSE=(sudo docker compose)
fi

upsert() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

echo "==> Patch SMTP in $ENV_FILE"
upsert SMTP_HOST "smtp.qq.com"
upsert SMTP_PORT "465"
upsert SMTP_SECURE "true"
upsert SMTP_USER "461628691@qq.com"
upsert SMTP_FROM "461628691@qq.com"
upsert SMTP_PASS "$NEW_PASS"
upsert MAIL_DEV_LOG_ONLY "false"
upsert REGISTER_EMAIL_VERIFICATION_ENABLED "true"
upsert SMTP_CONNECTION_TIMEOUT_MS "10000"
upsert SMTP_GREETING_TIMEOUT_MS "10000"
upsert SMTP_SOCKET_TIMEOUT_MS "10000"

echo "==> Current SMTP config:"
grep -E '^(SMTP_|MAIL_|REGISTER_EMAIL)' "$ENV_FILE"

echo "==> Recreate api-service only (no image rebuild)"
"${COMPOSE[@]}" -f deployment/cloud/tencent-lighthouse/compose.standalone.yml up -d --force-recreate --no-deps api-service

echo "==> Wait for health..."
for i in $(seq 1 30); do
  if "${DOCKER[@]}" exec service-api-prod wget -q -O- http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "API healthy"
    break
  fi
  sleep 3
done

echo "==> SMTP logs:"
"${DOCKER[@]}" logs service-api-prod --tail 40 2>&1 | grep -iE 'SMTP|mail|Invalid login|535' || true

echo "==> Container SMTP env:"
"${DOCKER[@]}" exec service-api-prod printenv | grep -E '^(SMTP_|MAIL_|REGISTER_EMAIL)' | sort

echo "DONE"

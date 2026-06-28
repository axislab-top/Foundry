#!/usr/bin/env bash
# 在服务器上更新 SMTP 授权码并重启 API（无需重建镜像）
set -euo pipefail

FOUNDRY_ROOT="${FOUNDRY_ROOT:-/opt/foundry}"
ENV_FILE="$FOUNDRY_ROOT/deployment/docker/.env"
NEW_PASS="${1:-}"

if [[ -z "$NEW_PASS" ]]; then
  echo "Usage: $0 <SMTP_PASS>"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

cd "$FOUNDRY_ROOT"

DOCKER=(docker)
COMPOSE=(docker compose)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
  COMPOSE=(sudo docker compose)
fi

echo "==> Updating SMTP_PASS in $ENV_FILE"
if grep -q '^SMTP_PASS=' "$ENV_FILE"; then
  sed -i "s/^SMTP_PASS=.*/SMTP_PASS=${NEW_PASS}/" "$ENV_FILE"
else
  echo "SMTP_PASS=${NEW_PASS}" >> "$ENV_FILE"
fi

for key in SMTP_HOST SMTP_USER SMTP_FROM REGISTER_EMAIL_VERIFICATION_ENABLED MAIL_DEV_LOG_ONLY; do
  grep "^${key}=" "$ENV_FILE" || echo "WARN: missing ${key}"
done

echo "==> Recreate api-service to reload env"
"${COMPOSE[@]}" -f deployment/cloud/tencent-lighthouse/compose.standalone.yml up -d --force-recreate api-service

echo "==> SMTP startup log (last 30 lines)"
sleep 8
"${DOCKER[@]}" logs service-api-prod --tail 30 2>&1 | grep -iE 'SMTP|mail' || true

echo "DONE — test registration at https://axislab.top"

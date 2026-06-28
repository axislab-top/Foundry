#!/usr/bin/env python3
"""Patch SMTP QQ account on Tencent server and recreate API only."""
import paramiko
import sys

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
SMTP_USER = "3900971531@qq.com"
SMTP_PASS = "eicydkiarngvccgd"

REMOTE_SCRIPT = f"""#!/bin/bash
set -euo pipefail
FOUNDRY_ROOT=/opt/foundry
ENV_FILE=$FOUNDRY_ROOT/deployment/docker/.env
cd "$FOUNDRY_ROOT"

DOCKER=(docker)
COMPOSE=(docker compose)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
  COMPOSE=(sudo docker compose)
fi

upsert() {{
  local key="$1" val="$2"
  if grep -q "^${{key}}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${{key}}=.*|${{key}}=${{val}}|" "$ENV_FILE"
  else
    echo "${{key}}=${{val}}" >> "$ENV_FILE"
  fi
}}

echo "==> Patch SMTP account"
upsert SMTP_HOST smtp.qq.com
upsert SMTP_PORT 465
upsert SMTP_SECURE true
upsert SMTP_USER {SMTP_USER}
upsert SMTP_FROM {SMTP_USER}
upsert SMTP_PASS {SMTP_PASS}
upsert MAIL_DEV_LOG_ONLY false
upsert REGISTER_EMAIL_VERIFICATION_ENABLED true

grep -E '^(SMTP_|MAIL_|REGISTER_EMAIL)' "$ENV_FILE"

echo "==> Recreate api-service only"
"${{COMPOSE[@]}}" -f deployment/cloud/tencent-lighthouse/compose.standalone.yml up -d --force-recreate --no-deps api-service

for i in $(seq 1 30); do
  if "${{DOCKER[@]}}" exec service-api-prod wget -q -O- http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "API healthy"
    break
  fi
  sleep 3
done

echo "==> nodemailer verify"
"${{DOCKER[@]}}" exec service-api-prod node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({{
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {{ user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }},
}});
t.verify().then(() => console.log('SMTP_VERIFY_OK')).catch(e => console.log('SMTP_VERIFY_FAIL', e.message));
"

echo "==> startup mail logs"
"${{DOCKER[@]}}" logs service-api-prod --tail 20 2>&1 | grep -iE 'SMTP|mail' || true
echo DONE
"""


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    _, stdout, stderr = client.exec_command(
        f"bash -s <<'REMOTE_EOF'\n{REMOTE_SCRIPT}\nREMOTE_EOF", timeout=300
    )
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())

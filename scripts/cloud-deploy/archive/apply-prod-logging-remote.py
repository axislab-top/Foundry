#!/usr/bin/env python3
"""应用 MVP 生产日志策略到云服务器（env + compose + 热补丁 api/gateway dist）。"""
import os
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE_LOCAL = os.path.join(
    REPO, "deployment/cloud/tencent-lighthouse/compose.standalone.yml"
)
COMPOSE_REMOTE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

LOGGING_DIST = [
    "infrastructure/logging/dist/log-level-env.js",
    "infrastructure/logging/dist/index.js",
]

PATCH_DIST = [
    ("apps/api/dist/common/interceptors/logging.interceptor.js", "service-api-prod", "apps/api"),
    ("apps/api/dist/main.js", "service-api-prod", "apps/api"),
    ("apps/gateway/dist/common/interceptors/logging.interceptor.js", "service-gateway-prod", "apps/gateway"),
    ("apps/gateway/dist/main.js", "service-gateway-prod", "apps/gateway"),
    ("apps/worker/dist/main.js", "service-worker-prod", "apps/worker"),
]

script_tail = r"""
set -e
cd /opt/foundry

echo '========== 设置 LOG_LEVEL=warn =========='
ENV_FILE=deployment/docker/.env
grep -q '^LOG_LEVEL=' "$ENV_FILE" 2>/dev/null && \
  sed -i 's/^LOG_LEVEL=.*/LOG_LEVEL=warn/' "$ENV_FILE" || \
  echo 'LOG_LEVEL=warn' >> "$ENV_FILE"
grep -q '^DB_LOGGING=' "$ENV_FILE" 2>/dev/null && \
  sed -i 's/^DB_LOGGING=.*/DB_LOGGING=false/' "$ENV_FILE" || \
  echo 'DB_LOGGING=false' >> "$ENV_FILE"
grep -E '^LOG_LEVEL=|^DB_LOGGING=' "$ENV_FILE"

echo ''
echo '========== 截断已有大日志 =========='
for f in $(sudo find /var/lib/docker/containers -name '*-json.log' -size +1M 2>/dev/null); do
  sudo truncate -s 0 "$f"
done

echo ''
echo '========== 重建服务（应用 compose 日志轮转 + LOG_LEVEL） =========='
sudo docker compose -f deployment/cloud/tencent-lighthouse/compose.standalone.yml up -d --force-recreate
sleep 15
sudo docker ps --format 'table {{.Names}}\t{{.Status}}' | head -10

echo ''
echo '========== 验证 LOG_LEVEL =========='
for svc in service-api-prod service-gateway-prod service-worker-prod; do
  echo -n "$svc LOG_LEVEL="
  sudo docker exec $svc printenv LOG_LEVEL 2>/dev/null || echo missing
done

echo ''
echo '========== 日志占用 =========='
df -h / | tail -1
sudo find /var/lib/docker/containers -name '*-json.log' -exec du -ch {} + 2>/dev/null | tail -1
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = c.open_sftp()

# 上传 compose
remote_compose = "/opt/foundry/" + COMPOSE_REMOTE.replace("\\", "/")
sftp.put(COMPOSE_LOCAL, remote_compose)
print("Uploaded compose.standalone.yml")

# 热补丁 dist
for rel, container, app_dir in PATCH_DIST:
    local_path = os.path.join(REPO, rel.replace("/", os.sep))
    if not os.path.isfile(local_path):
        print(f"SKIP missing {rel}")
        continue
    remote_tmp = f"/tmp/{rel.replace('/', '_')}"
    sftp.put(local_path, remote_tmp)
    container_path = f"/app/{app_dir}/dist/{rel.split('dist/', 1)[1]}"
    cmd = f"sudo docker cp {remote_tmp} {container}:{container_path}"
    print(f">>> {cmd}")
    c.exec_command(cmd, timeout=60)[1].read()

for rel in LOGGING_DIST:
    local_path = os.path.join(REPO, rel.replace("/", os.sep))
    if not os.path.isfile(local_path):
        print(f"SKIP missing {rel}")
        continue
    remote_tmp = f"/tmp/{rel.replace('/', '_')}"
    sftp.put(local_path, remote_tmp)
    for container in ("service-api-prod", "service-gateway-prod", "service-worker-prod"):
        cmd = f"sudo docker cp {remote_tmp} {container}:/app/{rel}"
        print(f">>> {cmd}")
        c.exec_command(cmd, timeout=60)[1].read()

sftp.close()
_, o, e = c.exec_command(script_tail, timeout=600)
print(o.read().decode())
if e.read().decode():
    print("STDERR:", e.read().decode())
c.close()

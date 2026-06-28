#!/usr/bin/env python3
"""重建后重新打补丁并启动 gateway。"""
import os
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

PATCH = [
    ("apps/api/dist/common/interceptors/logging.interceptor.js", "service-api-prod", "apps/api"),
    ("apps/api/dist/main.js", "service-api-prod", "apps/api"),
    ("apps/gateway/dist/common/interceptors/logging.interceptor.js", "service-gateway-prod", "apps/gateway"),
    ("apps/gateway/dist/main.js", "service-gateway-prod", "apps/gateway"),
    ("apps/worker/dist/main.js", "service-worker-prod", "apps/worker"),
]
LOGGING = [
    "infrastructure/logging/dist/log-level-env.js",
    "infrastructure/logging/dist/index.js",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

# 先启动 gateway/nginx（不等待 worker healthy）
c.exec_command(
    f"cd /opt/foundry && sudo docker compose -f {COMPOSE} up -d --no-deps gateway-service nginx",
    timeout=120,
)[1].read()

sftp = c.open_sftp()
for rel, container, app_dir in PATCH:
    local = os.path.join(REPO, rel.replace("/", os.sep))
    if not os.path.isfile(local):
        continue
    tmp = f"/tmp/{rel.replace('/', '_')}"
    sftp.put(local, tmp)
    path = f"/app/{app_dir}/dist/{rel.split('dist/', 1)[1]}"
    c.exec_command(f"sudo docker cp {tmp} {container}:{path}", timeout=60)

for rel in LOGGING:
    local = os.path.join(REPO, rel.replace("/", os.sep))
    if not os.path.isfile(local):
        continue
    tmp = f"/tmp/{rel.replace('/', '_')}"
    sftp.put(local, tmp)
    for container in ("service-api-prod", "service-gateway-prod", "service-worker-prod"):
        c.exec_command(f"sudo docker cp {tmp} {container}:/app/{rel}", timeout=60)

sftp.close()

script = f"""
cd /opt/foundry
sudo docker restart service-api-prod service-gateway-prod service-worker-prod
sleep 15
sudo docker compose -f {COMPOSE} up -d nginx
sudo docker ps --format 'table {{{{.Names}}}}\t{{{{.Status}}}}'
curl -sf http://127.0.0.1/health && echo OK
"""
_, o, _ = c.exec_command(script, timeout=180)
print(o.read().decode())
c.close()

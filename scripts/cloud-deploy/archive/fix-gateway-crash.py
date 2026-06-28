#!/usr/bin/env python3
"""快速修复 gateway 崩溃并注入完整补丁（不重建容器）。"""
import os
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
CONTAINER = "service-gateway-prod"

FILES = [
    ("apps/gateway/dist/common/security/services/data-masking.service.js", "/app/apps/gateway/dist/common/security/services/data-masking.service.js"),
    ("apps/gateway/dist/modules/audit/services/audit.service.js", "/app/apps/gateway/dist/modules/audit/services/audit.service.js"),
    ("apps/gateway/dist/common/interceptors/logging.interceptor.js", "/app/apps/gateway/dist/common/interceptors/logging.interceptor.js"),
    ("apps/gateway/dist/common/resilience/interceptors/circuit-breaker.interceptor.js", "/app/apps/gateway/dist/common/resilience/interceptors/circuit-breaker.interceptor.js"),
    ("apps/gateway/dist/modules/auth/auth.service.js", "/app/apps/gateway/dist/modules/auth/auth.service.js"),
    ("apps/gateway/dist/main.js", "/app/apps/gateway/dist/main.js"),
    ("infrastructure/logging/dist/log-level-env.js", "/app/infrastructure/logging/dist/log-level-env.js"),
    ("infrastructure/logging/dist/index.js", "/app/infrastructure/logging/dist/index.js"),
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="ubuntu", password="right123..", timeout=30)

# 先停掉崩溃循环
c.exec_command(f"sudo docker update --restart=no {CONTAINER}", timeout=15)[1].read()
c.exec_command(f"sudo docker stop {CONTAINER}", timeout=30)[1].read()

sftp = c.open_sftp()
cmds = []
for local_rel, container_path in FILES:
    local_path = os.path.join(REPO, local_rel.replace("/", os.sep))
    tmp = f"/tmp/{local_rel.replace('/', '_')}"
    sftp.put(local_path, tmp)
    cmds.append(f"sudo docker cp {tmp} {CONTAINER}:{container_path}")
sftp.close()

script = "\n".join(cmds) + f"""
sudo docker update --restart=unless-stopped {CONTAINER}
sudo docker start {CONTAINER}
sleep 15
sudo docker ps --filter name={CONTAINER} --format '{{{{.Names}}}} {{{{.Status}}}}'
sudo docker logs {CONTAINER} --tail 5 2>&1
curl -s -i -X POST http://127.0.0.1:3002/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{{"username":"testuser","email":"newtest@example.com","password":"TestPass123!"}}' | head -12
"""
_, o, e = c.exec_command(script, timeout=120)
print(o.read().decode())
print(e.read().decode())
c.close()

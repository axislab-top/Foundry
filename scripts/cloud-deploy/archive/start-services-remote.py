#!/usr/bin/env python3
"""启动腾讯云 Foundry 全部服务。"""
import paramiko
import sys

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

script = f"""
set -e
cd /opt/foundry
echo '==> 启动前状态'
sudo docker ps -a --format 'table {{{{.Names}}}}\t{{{{.Status}}}}' | head -12

echo ''
echo '==> 启动全部服务'
sudo docker compose -f {COMPOSE} up -d
sleep 20

echo ''
echo '==> 启动后状态'
sudo docker ps --format 'table {{{{.Names}}}}\t{{{{.Status}}}}'

echo ''
echo '==> 健康检查'
curl -sf http://127.0.0.1/health && echo ' nginx: OK' || echo ' nginx: FAIL'
curl -sf http://127.0.0.1:3002/api/health && echo ' gateway: OK' || echo ' gateway: FAIL'
curl -sf http://127.0.0.1:3000/api/health && echo ' api: OK' || echo ' api: FAIL'
df -h / | tail -1
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)
print("正在启动服务...")
_, o, e = c.exec_command(script, timeout=300)
print(o.read().decode())
err = e.read().decode()
if err:
    print(err, file=sys.stderr)
c.close()

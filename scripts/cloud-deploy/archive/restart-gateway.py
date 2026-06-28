#!/usr/bin/env python3
import paramiko

COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

script = f"""
cd /opt/foundry
ls -lh /tmp/gateway-flat.tar 2>/dev/null || echo 'no temp tar'
rm -f /tmp/gateway-flat.tar 2>/dev/null || true

sudo docker compose -f {COMPOSE} up -d gateway-service
sleep 10
sudo docker ps --filter name=service-gateway-prod --format '{{{{.Names}}}} {{{{.Status}}}}'

df -h / | tail -1
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=120)
print(o.read().decode())
c.close()

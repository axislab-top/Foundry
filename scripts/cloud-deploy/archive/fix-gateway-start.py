#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=15)
script = r"""
cd /opt/foundry
sudo docker inspect service-worker-prod --format '{{json .State.Health}}' | head -c 800
echo ''
sudo docker exec service-worker-prod wget -qO- http://localhost:3004/api/health 2>&1 | head -3
echo ''
sudo docker compose -f deployment/cloud/tencent-lighthouse/compose.standalone.yml up -d gateway-service nginx
sleep 12
sudo docker ps -a --format '{{.Names}} {{.Status}}' | grep -E 'gateway|nginx|worker'
"""
_, o, _ = c.exec_command(script, timeout=120)
print(o.read().decode())
c.close()

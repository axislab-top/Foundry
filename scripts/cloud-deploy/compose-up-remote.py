#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "cd /opt/foundry && sudo docker compose -f deployment/cloud/tencent-lighthouse/compose.standalone.yml up -d && sleep 20 && sudo docker ps --format 'table {{.Names}}\t{{.Status}}'",
    timeout=120,
)
print(o.read().decode())
c.close()

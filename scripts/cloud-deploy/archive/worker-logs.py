#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=15)
_, o, _ = c.exec_command("sudo docker logs service-worker-prod 2>&1 | head -40", timeout=30)
print(o.read().decode())
c.close()

#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=15)
_, o, _ = c.exec_command(
    "sudo docker ps -a --format '{{.Names}} {{.Status}}'; echo '---'; "
    "sudo docker logs service-worker-prod --tail 15 2>&1; echo '---'; "
    "sudo docker logs service-gateway-prod --tail 10 2>&1",
    timeout=45,
)
print(o.read().decode())
c.close()

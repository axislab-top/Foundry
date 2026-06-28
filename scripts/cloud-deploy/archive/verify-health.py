#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=15)
_, o, _ = c.exec_command(
    "sudo docker exec service-gateway-prod wget -qO- http://127.0.0.1:3002/api/health; echo; "
    "sudo docker exec service-api-prod wget -qO- http://127.0.0.1:3000/api/health; echo; "
    "curl -sk https://axislab.top/health; echo; "
    "curl -sk -o /dev/null -w '%{http_code}' https://axislab.top/api/health",
    timeout=30,
)
print(o.read().decode())
c.close()

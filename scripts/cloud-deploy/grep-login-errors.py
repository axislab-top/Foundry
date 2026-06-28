#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
script = r"""
echo '=== auth/login 500 ==='
sudo docker logs service-gateway-prod 2>&1 | grep 'auth/login' | grep -E '500|503|ERROR' | tail -15

echo ''
echo '=== auth/refresh errors ==='
sudo docker logs service-gateway-prod 2>&1 | grep 'auth/refresh' | tail -10

echo ''
echo '=== recent 500 paths ==='
sudo docker logs service-gateway-prod 2>&1 | grep 'statusCode=500' | tail -15
"""
_, o, _ = c.exec_command(script, timeout=90)
print(o.read().decode(errors="replace"))
c.close()

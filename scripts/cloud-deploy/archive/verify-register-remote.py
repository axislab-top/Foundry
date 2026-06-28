#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
script = """
echo '=== direct gateway 3002 ==='
curl -v -X POST http://127.0.0.1:3002/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"testuser","email":"newtest@example.com","password":"TestPass123!"}' 2>&1 | tail -25
echo ''
echo '=== via nginx https ==='
curl -s -i -X POST https://axislab.top/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"testuser","email":"newtest@example.com","password":"TestPass123!"}' | head -20
echo ''
echo '=== gateway logs tail ==='
sudo docker logs service-gateway-prod --tail 8 2>&1
"""
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
c.close()

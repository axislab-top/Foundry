#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
script = """
curl -s -i -X POST http://127.0.0.1:3002/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"testuser","email":"newtest@example.com","password":"TestPass123!"}' | head -20
echo '---'
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'
echo '---'
curl -s https://axislab.top/health
"""
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
if e.read().decode():
    print("ERR:", e.read())
c.close()

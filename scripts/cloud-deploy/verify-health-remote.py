#!/usr/bin/env python3
import json
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

script = """
echo '=== curl tests ==='
curl -sS -o /dev/null -w 'nginx /health: %{http_code}\\n' http://127.0.0.1/health
curl -sS -o /dev/null -w 'gateway :3002/health: %{http_code}\\n' http://127.0.0.1:3002/health 2>/dev/null || echo gateway 3002 fail
curl -sS -o /dev/null -w 'gateway :3002/api/health: %{http_code}\\n' http://127.0.0.1:3002/api/health 2>/dev/null || echo gateway api/health fail
curl -sS -o /dev/null -w 'api :3000/health: %{http_code}\\n' http://127.0.0.1:3000/health 2>/dev/null || echo api 3000 fail
curl -sS -o /dev/null -w 'api :3000/api/health: %{http_code}\\n' http://127.0.0.1:3000/api/health 2>/dev/null || echo api api/health fail

echo ''
echo '=== login test ==='
curl -sS -X POST http://127.0.0.1:3002/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"test@test.com","password":"wrong"}' | head -c 200
echo ''

echo ''
echo '=== docker logs gateway (last 5 lines) ==='
sudo docker logs service-gateway-prod 2>&1 | tail -5

echo ''
echo '=== docker logs api (last 5 lines) ==='
sudo docker logs service-api-prod 2>&1 | tail -5

echo ''
echo '=== disk ==='
df -h / | tail -1
"""

_, stdout, _ = client.exec_command(script, timeout=60)
print(stdout.read().decode(errors="replace"))
client.close()

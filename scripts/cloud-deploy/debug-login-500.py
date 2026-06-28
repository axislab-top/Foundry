#!/usr/bin/env python3
import json
import paramiko
import urllib.request
import urllib.error

# external tests
tests = [
    ("health", "GET", "https://axislab.top/api/health", None),
    ("login_wrong", "POST", "https://axislab.top/api/auth/login", {"email": "3900971531@qq.com", "password": "wrongpass123"}),
    ("refresh", "POST", "https://axislab.top/api/auth/refresh", {"refreshToken": "invalid"}),
]
for name, method, url, body in tests:
    try:
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if body else {}, method=method)
        r = urllib.request.urlopen(req, timeout=20)
        print(f"{name}: {r.status} {r.read()[:300].decode(errors='replace')}")
    except urllib.error.HTTPError as e:
        print(f"{name}: {e.code} {e.read()[:400].decode(errors='replace')}")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

script = r"""
echo '=== gateway 500/errors (grep) ==='
sudo docker logs service-gateway-prod 2>&1 | grep -E 'statusCode=500|Internal Server|500' | tail -20

echo ''
echo '=== api 500/errors (grep) ==='
sudo docker logs service-api-prod 2>&1 | grep -iE 'ERROR|500|Exception' | tail -25

echo ''
echo '=== login internal ==='
curl -sS -m 20 -X POST http://127.0.0.1/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"3900971531@qq.com","password":"wrongpass123"}'
echo ''
"""
_, o, _ = c.exec_command(script, timeout=120)
print("\n--- server ---")
print(o.read().decode(errors="replace")[:5000])
c.close()

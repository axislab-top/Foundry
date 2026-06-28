#!/usr/bin/env python3
"""部署后全面检查：服务状态、健康、迁移、磁盘、登录。"""
import json
import paramiko
import urllib.request
import urllib.error

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

script = r"""
echo '=== 磁盘 ==='
df -h / | tail -1

echo ''
echo '=== 容器状态 ==='
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'

echo ''
echo '=== 迁移记录 ==='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -t -c \
  "SELECT name FROM migrations WHERE name = 'UserCreditAccounts20260622130000';"

echo ''
echo '=== user_credit_accounts 抽样 ==='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -c \
  "SELECT COUNT(*) AS accounts, MIN(total_amount) AS min_total, MAX(total_amount) AS max_total FROM user_credit_accounts;"

echo ''
echo '=== LOG_LEVEL ==='
for svc in service-api-prod service-gateway-prod service-worker-prod; do
  echo -n "$svc="; sudo docker exec $svc printenv LOG_LEVEL 2>/dev/null || echo n/a
done

echo ''
echo '=== 内网健康 ==='
curl -sf http://127.0.0.1/health && echo ' nginx OK' || echo ' nginx FAIL'
curl -sf http://127.0.0.1/api/health && echo ' gateway OK' || echo ' gateway FAIL'

echo ''
echo '=== refresh 无效 token（应 401 非 500）==='
curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1/api/auth/refresh \
  -H 'Content-Type: application/json' -d '{"refreshToken":"bad"}'
echo ''
"""

_, o, _ = c.exec_command(script, timeout=120)
print(o.read().decode(errors="replace"))
c.close()

# 公网
for name, url, method, body in [
    ("health", "https://axislab.top/api/health", "GET", None),
    ("refresh", "https://axislab.top/api/auth/refresh", "POST", {"refreshToken": "bad"}),
]:
    try:
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"} if body else {},
            method=method,
        )
        r = urllib.request.urlopen(req, timeout=20)
        print(f"[public {name}] {r.status} {r.read()[:120].decode(errors='replace')}")
    except urllib.error.HTTPError as e:
        print(f"[public {name}] {e.code} {e.read()[:200].decode(errors='replace')}")

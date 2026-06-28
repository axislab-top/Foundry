#!/usr/bin/env python3
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

checks = r"""
echo '=== 1. 磁盘 ==='
df -h / | tail -1

echo ''
echo '=== 2. Postgres logging 配置 ==='
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW logging_collector;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_statement;"
grep -E '^log_statement|^logging_collector' /opt/foundry/infrastructure/postgres/config/postgresql.conf 2>/dev/null | head -5

echo ''
echo '=== 3. chat_rooms 约束（direct）==='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -t -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='chat_rooms'::regclass AND conname='chk_chat_rooms_type';"

echo ''
echo '=== 4. 服务镜像与状态 ==='
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'

echo ''
echo '=== 5. LOG_LEVEL ==='
sudo docker exec service-gateway-prod printenv LOG_LEVEL 2>/dev/null
sudo docker exec service-api-prod printenv LOG_LEVEL 2>/dev/null
"""

_, o, _ = c.exec_command(checks, timeout=60)
print(o.read().decode(errors="replace"))
c.close()

# refresh 无效 token 仍可能是 500（gateway 未重部署 jwt 修复）
try:
    req = urllib.request.Request(
        "https://axislab.top/api/auth/refresh",
        data=json.dumps({"refreshToken": "bad"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(req)
except urllib.error.HTTPError as e:
    print(f"\n=== 6. refresh 无效 token（gateway 是否已修 jwt→401）==="
          f"\nHTTP {e.code}: {e.read()[:150].decode(errors='replace')}")

#!/usr/bin/env python3
"""检查云服务器数据库配置与组织编制相关数据。"""
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

script = r"""
set -e
PG=service-postgres-prod

echo '========== 1. 各服务 DB 环境变量 =========='
for svc in service-api-prod service-gateway-prod service-worker-prod; do
  echo "--- $svc ---"
  sudo docker exec $svc printenv 2>/dev/null | grep -E '^DB_' | sort || true
done

echo ''
echo '========== 2. 数据库列表 =========='
sudo docker exec $PG psql -U postgres -c "\l" | grep -E 'service_db|gateway_db|Name'

echo ''
echo '========== 3. service_db 核心表行数 =========='
for tbl in users companies departments platform_departments organization_templates org_templates; do
  cnt=$(sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$tbl';" 2>/dev/null || echo 0)
  if [ "$cnt" = "1" ]; then
    n=$(sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM $tbl;" 2>/dev/null)
    echo "  $tbl: $n"
  else
    echo "  $tbl: (table not found)"
  fi
done

echo ''
echo '========== 4. 所有 public 表及行数 (service_db, >0) =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "
SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname='public' AND n_live_tup > 0
ORDER BY n_live_tup DESC
LIMIT 40;
"

echo ''
echo '========== 5. 搜索含 department/platform 的表 =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND (
  table_name ILIKE '%department%'
  OR table_name ILIKE '%platform%'
  OR table_name ILIKE '%org%'
  OR table_name ILIKE '%template%'
  OR table_name ILIKE '%structure%'
)
ORDER BY table_name;
"

echo ''
echo '========== 6. companies 样本 =========='
sudo docker exec $PG psql -U postgres -d service_db -c "SELECT id, name, \"createdAt\" FROM companies ORDER BY \"createdAt\" DESC LIMIT 5;" 2>/dev/null || echo '(companies query failed)'

echo ''
echo '========== 7. users 数量 =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM users;"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, o, e = c.exec_command(script, timeout=120)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
c.close()

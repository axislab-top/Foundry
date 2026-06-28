#!/usr/bin/env python3
import paramiko

script = r"""
PG=service-postgres-prod
DUMP=/opt/foundry/backup/foundry-db.dump

echo '========== pg_restore --list 中 platform / marketplace 相关 =========='
pg_restore -l $DUMP 2>/dev/null | grep -iE 'platform_department|marketplace_agent|company_template' | head -30

echo ''
echo '========== 当前 marketplace_agents 唯一记录 =========='
sudo docker exec $PG psql -U postgres -d service_db -c "SELECT * FROM marketplace_agents LIMIT 5;"

echo ''
echo '========== platform_department_audit_logs =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM platform_department_audit_logs;" 2>/dev/null || echo 0

echo ''
echo '========== 从 dump 统计 COPY 块（strings） =========='
for t in platform_departments marketplace_agents company_templates template_agent_mappings; do
  if strings $DUMP | grep -q "COPY public.$t "; then
    echo "  $t: COPY block exists in dump"
  else
    echo "  $t: NOT in dump"
  fi
done

echo ''
echo '========== 尝试 pg_restore --data-only 单表到临时库（只看行数） =========='
sudo docker exec $PG psql -U postgres -c "DROP DATABASE IF EXISTS restore_check;" 2>/dev/null
sudo docker exec $PG psql -U postgres -c "CREATE DATABASE restore_check;"
sudo docker exec $PG pg_restore -U postgres -d restore_check --section=pre-data $DUMP 2>&1 | tail -5
sudo docker exec $PG pg_restore -U postgres -d restore_check --data-only -t platform_departments -t marketplace_agents $DUMP 2>&1 | tail -20
echo 'restore_check counts:'
sudo docker exec $PG psql -U postgres -d restore_check -tAc "SELECT 'platform_departments', count(*) FROM platform_departments UNION ALL SELECT 'marketplace_agents', count(*) FROM marketplace_agents;"
sudo docker exec $PG psql -U postgres -c "DROP DATABASE restore_check;"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=300)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err[-3000:])
c.close()

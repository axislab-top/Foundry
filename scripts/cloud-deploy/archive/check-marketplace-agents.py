#!/usr/bin/env python3
import paramiko

script = r"""
PG=service-postgres-prod

echo '========== marketplace_agents (department_head) =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT slug, name, agent_category, is_published
FROM marketplace_agents
WHERE agent_category = 'department_head'
ORDER BY name
LIMIT 25;
"

echo ''
echo '========== marketplace_agents counts =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM marketplace_agents;"
sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM marketplace_agents WHERE agent_category='department_head';"
sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM marketplace_agents WHERE agent_category='department_head' AND is_published=true;"

echo ''
echo '========== companies sample =========='
sudo docker exec $PG psql -U postgres -d service_db -c "SELECT id, name, created_at FROM companies ORDER BY created_at DESC LIMIT 5;"

echo ''
echo '========== 本地 dump 是否含 platform_departments =========='
# 从 dump 文件 grep 表名（不恢复）
grep -c 'platform_departments' /opt/foundry/backup/foundry-db.dump 2>/dev/null || echo 'grep failed'
strings /opt/foundry/backup/foundry-db.dump 2>/dev/null | grep -m3 'COPY public.platform_departments' || echo 'no COPY line in dump'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=120)
print(o.read().decode())
err = e.read().decode()
if err and 'ERROR' in err:
    print("STDERR:", err)
c.close()

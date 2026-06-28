#!/usr/bin/env python3
import paramiko

script = r"""
PG=service-postgres-prod
DUMP=/opt/foundry/backup/foundry-db.dump

echo '========== dump 文件信息 =========='
ls -lh $DUMP

echo ''
echo '========== pg_restore --list (host) =========='
pg_restore -l $DUMP 2>/dev/null | grep -iE 'TABLE DATA.*(platform_department|marketplace_agent)' | head -20

echo ''
echo '========== 恢复到临时库 restore_check =========='
sudo docker exec $PG psql -U postgres -c "DROP DATABASE IF EXISTS restore_check;" 2>/dev/null
sudo docker exec $PG psql -U postgres -c "CREATE DATABASE restore_check;"

echo '--- full restore to restore_check ---'
cat $DUMP | sudo docker exec -i $PG pg_restore -U postgres -d restore_check --no-owner --no-acl 2>&1 | grep -iE 'error|platform_department|marketplace_agent' | head -30

echo ''
echo '--- restore_check table counts ---'
sudo docker exec $PG psql -U postgres -d restore_check -c "
SELECT 'platform_departments' as tbl, count(*) FROM platform_departments
UNION ALL SELECT 'marketplace_agents', count(*) FROM marketplace_agents
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'agents', count(*) FROM agents;
"

echo ''
echo '--- sample platform_departments from backup ---'
sudo docker exec $PG psql -U postgres -d restore_check -c "
SELECT slug, display_name, director_marketplace_agent_id, is_default_for_new_company
FROM platform_departments ORDER BY sort_order LIMIT 10;
" 2>/dev/null || echo 'query failed'

echo ''
echo '--- sample marketplace_agents department_head from backup ---'
sudo docker exec $PG psql -U postgres -d restore_check -c "
SELECT slug, name, agent_category, is_published
FROM marketplace_agents WHERE agent_category='department_head' LIMIT 10;
" 2>/dev/null || echo 'query failed'

sudo docker exec $PG psql -U postgres -c "DROP DATABASE restore_check;"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=600)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR (tail):", err[-2000:])
c.close()

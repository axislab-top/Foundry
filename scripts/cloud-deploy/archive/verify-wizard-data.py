#!/usr/bin/env python3
import paramiko

script = r"""
PG=service-postgres-prod

echo '========== 最终数据确认 =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT 'users' t, count(*)::text c FROM users
UNION ALL SELECT 'companies', count(*)::text FROM companies
UNION ALL SELECT 'agents', count(*)::text FROM agents
UNION ALL SELECT 'marketplace_agents', count(*)::text FROM marketplace_agents
UNION ALL SELECT 'platform_departments', count(*)::text FROM platform_departments
UNION ALL SELECT 'dept_with_director', count(*)::text FROM platform_departments WHERE director_marketplace_agent_id IS NOT NULL;
"

echo ''
echo '========== 带主管且已上架的部门（向导用） =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT d.slug, d.display_name, m.slug as head_slug, m.is_published
FROM platform_departments d
JOIN marketplace_agents m ON m.id = d.director_marketplace_agent_id
WHERE m.agent_category = 'department_head' AND m.is_published = true
ORDER BY d.sort_order
LIMIT 12;
"

echo ''
echo '========== 从 API 容器内测 catalog 逻辑（直连 3001） =========='
# 用最近创建的 draft company
CID=$(sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT id FROM companies ORDER BY created_at DESC LIMIT 1;")
echo "draft company: $CID"
curl -s -X POST http://127.0.0.1:3001/api/v1/companies/wizard/template-recommendations \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"测试\",\"industry\":\"tech\",\"scale\":\"small\",\"draftCompanyId\":\"$CID\"}" | head -c 1200
echo ''
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=90)
print(o.read().decode())
c.close()

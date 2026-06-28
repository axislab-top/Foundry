#!/usr/bin/env python3
"""深入检查 platform_departments 与部门主管 Agent 配置。"""
import paramiko

script = r"""
PG=service-postgres-prod

echo '========== platform_departments 表结构 =========='
sudo docker exec $PG psql -U postgres -d service_db -c "\d platform_departments"

echo ''
echo '========== platform_departments 全量 =========='
sudo docker exec $PG psql -U postgres -d service_db -c "SELECT * FROM platform_departments LIMIT 20;"

echo ''
echo '========== 已上架的 department_head Agent =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT slug, name, \"agentCategory\", \"isPublished\", status
FROM agents
WHERE \"agentCategory\" = 'department_head'
ORDER BY name
LIMIT 20;
"

echo ''
echo '========== department_head 数量 =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "
SELECT count(*) FROM agents WHERE \"agentCategory\" = 'department_head';
"
sudo docker exec $PG psql -U postgres -d service_db -tAc "
SELECT count(*) FROM agents WHERE \"agentCategory\" = 'department_head' AND \"isPublished\" = true;
"

echo ''
echo '========== company_templates =========='
sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM company_templates;" 2>/dev/null || echo 0

echo ''
echo '========== 测试 template-recommendations API =========='
# 取一个 draft company
DRAFT=$(sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT id FROM companies ORDER BY \"createdAt\" DESC LIMIT 1;")
echo "sample company id: $DRAFT"
if [ -n "$DRAFT" ]; then
  curl -s -X POST http://127.0.0.1:3001/api/v1/companies/wizard/template-recommendations \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"测试公司\",\"industry\":\"tech\",\"scale\":\"small\",\"draftCompanyId\":\"$DRAFT\"}" | head -c 800
  echo ''
fi

echo ''
echo '========== backup 目录 =========='
ls -la /opt/foundry/backup/ 2>/dev/null
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=120)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
c.close()

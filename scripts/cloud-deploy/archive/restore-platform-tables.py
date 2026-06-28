#!/usr/bin/env python3
"""从 backup dump 补恢复 marketplace_agents / platform_departments 等向导依赖表。"""
import paramiko
import sys

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

TABLES = [
    "marketplace_agents",
    "platform_departments",
    "company_templates",
    "template_agent_mappings",
    "template_contents",
]

script = rf"""
set -e
PG=service-postgres-prod
DUMP=/opt/foundry/backup/foundry-db.dump

echo '========== BEFORE =========='
for t in marketplace_agents platform_departments company_templates; do
  n=$(sudo docker exec $PG psql -U postgres -d service_db -tAc "SELECT count(*) FROM $t;" 2>/dev/null || echo ERR)
  echo "  $t: $n"
done

echo ''
echo '========== 清空并补恢复（仅目标表） =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
  TRUNCATE template_agent_mappings, template_contents, company_templates CASCADE;
  TRUNCATE platform_department_audit_logs;
  TRUNCATE platform_departments;
  TRUNCATE marketplace_agent_subscriptions;
  DELETE FROM marketplace_agents;
"

for t in {' '.join(TABLES)}; do
  echo "--- restoring data: $t ---"
  cat $DUMP | sudo docker exec -i $PG pg_restore -U postgres -d service_db \
    --data-only --no-owner --no-acl --disable-triggers -t "$t" 2>&1 | tail -3
done

echo ''
echo '========== AFTER =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT 'marketplace_agents' as tbl, count(*) FROM marketplace_agents
UNION ALL SELECT 'platform_departments', count(*) FROM platform_departments
UNION ALL SELECT 'department_head published', count(*) FROM marketplace_agents WHERE agent_category='department_head' AND is_published=true
UNION ALL SELECT 'company_templates', count(*) FROM company_templates;
"

echo ''
echo '========== 平台部门样本 =========='
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT slug, display_name, director_marketplace_agent_id IS NOT NULL as has_director
FROM platform_departments ORDER BY sort_order LIMIT 8;
"

echo ''
echo '========== 重启 API =========='
sudo docker restart service-api-prod
sleep 8
sudo docker ps --filter name=service-api-prod --format '{{{{.Names}}}} {{{{.Status}}}}'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
print("Connecting and restoring missing tables...")
_, o, e = c.exec_command(script, timeout=600)
out = o.read().decode()
err = e.read().decode()
print(out)
if err:
    print("STDERR:", err, file=sys.stderr)
c.close()

# verify API
verify = r'''
import json, urllib.request, urllib.error, ssl
ctx = ssl.create_default_context()
req = urllib.request.Request(
    "https://axislab.top/api/v1/platform/departments",
    headers={"Accept": "application/json"},
)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        body = json.loads(resp.read().decode())
        data = body.get("data", body)
        print("platform/departments count:", len(data) if isinstance(data, list) else data)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:300])
'''
import subprocess
subprocess.run([sys.executable, "-c", verify])

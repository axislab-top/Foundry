#!/usr/bin/env python3
import paramiko

script = r"""
PG=service-postgres-prod
sudo docker exec $PG psql -U postgres -d service_db -c "
SELECT conrelid::regclass AS table_name, confrelid::regclass AS references
FROM pg_constraint
WHERE confrelid = 'marketplace_agents'::regclass AND contype = 'f';
"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=30)
print(o.read().decode())
c.close()

#!/usr/bin/env python3
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

script = r"""
LOGDIR=/var/lib/docker/volumes/tencent-lighthouse_postgres-data/_data/18/docker/log
echo '=== log dir file count & largest files ==='
sudo find "$LOGDIR" -type f 2>/dev/null | wc -l
sudo ls -lhS "$LOGDIR" 2>/dev/null | head -15

echo ''
echo '=== postgresql logging config ==='
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_destination;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW logging_collector;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_directory;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_filename;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_rotation_size;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_min_duration_statement;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_statement;"

echo ''
echo '=== grep logging in postgresql.conf ==='
sudo docker exec service-postgres-prod grep -E '^[^#].*log' /etc/postgresql/postgresql.conf 2>/dev/null | head -20
"""

_, o, _ = c.exec_command(script, timeout=60)
print(o.read().decode(errors="replace"))
c.close()

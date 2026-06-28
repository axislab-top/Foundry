#!/usr/bin/env python3
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

script = r"""
echo '=== postgres volume breakdown ==='
sudo du -xh /var/lib/docker/volumes/tencent-lighthouse_postgres-data/_data --max-depth=3 2>/dev/null | sort -hr | head -25

echo ''
echo '=== pg_wal ==='
sudo find /var/lib/docker/volumes/tencent-lighthouse_postgres-data/_data -name pg_wal -type d -exec du -sh {} \; 2>/dev/null

echo ''
echo '=== data dir top level ==='
sudo ls -lah /var/lib/docker/volumes/tencent-lighthouse_postgres-data/_data/ 2>/dev/null

echo ''
echo '=== WAL settings ==='
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW wal_level;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW max_wal_size;"

echo ''
echo '=== /var/lib/docker breakdown ==='
sudo du -sh /var/lib/docker/* 2>/dev/null | sort -hr | head -10
"""

_, o, _ = c.exec_command(script, timeout=90)
print(o.read().decode(errors="replace"))
c.close()

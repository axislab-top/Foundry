#!/usr/bin/env python3
"""分析云服务器磁盘与内存占用。"""
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."

script = r"""
echo '========== 磁盘总览 =========='
df -h / /var/lib/docker 2>/dev/null | grep -v Filesystem

echo ''
echo '========== 内存总览 =========='
free -h

echo ''
echo '========== 各目录占用 TOP 15 (/) =========='
sudo du -xh / --max-depth=1 2>/dev/null | sort -hr | head -16

echo ''
echo '========== Docker 汇总 =========='
sudo docker system df -v 2>/dev/null | head -80

echo ''
echo '========== Docker Volumes 明细 =========='
sudo docker system df -v 2>/dev/null | awk '/Local Volumes/{f=1} f&&/^foundry|^service|^deployment/{print}' 
for v in $(sudo docker volume ls -q 2>/dev/null); do
  mp=$(sudo docker volume inspect "$v" --format '{{.Mountpoint}}' 2>/dev/null)
  sz=$(sudo du -sh "$mp" 2>/dev/null | cut -f1)
  echo "$sz  $v  ($mp)"
done

echo ''
echo '========== 容器内存占用 =========='
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' 2>/dev/null

echo ''
echo '========== Postgres 库大小 =========='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -c "
SELECT pg_database.datname AS db,
       pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database ORDER BY pg_database_size(pg_database.datname) DESC LIMIT 8;" 2>/dev/null || echo postgres query failed

sudo docker exec service-postgres-prod psql -U postgres -d service_db -c "
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS total
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;" 2>/dev/null || true

echo ''
echo '========== 大日志文件 (>50M) =========='
sudo find /var/lib/docker/containers -name '*-json.log' -size +50M -exec ls -lh {} \; 2>/dev/null | head -10 || echo none

echo ''
echo '========== /tmp 大文件 =========='
sudo du -ah /tmp 2>/dev/null | sort -hr | head -10

echo ''
echo '========== 当前运行容器 =========='
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, o, e = c.exec_command(script, timeout=120)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print(err, file=__import__("sys").stderr)
c.close()

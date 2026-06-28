#!/usr/bin/env python3
"""清理 Docker 容器日志（主要空间占用）并安全整理镜像。"""
import paramiko
import sys

COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

script = f"""
set -e
cd /opt/foundry

echo '========== 清理前 =========='
df -h / | tail -1
echo -n 'container logs total: '
sudo find /var/lib/docker/containers -name '*-json.log' -exec du -ch {{}} + 2>/dev/null | tail -1 | awk '{{print $1}}'

echo ''
echo '========== 最大日志 TOP5 =========='
sudo find /var/lib/docker/containers -name '*-json.log' -printf '%s %p\n' 2>/dev/null | sort -rn | head -5 | while read sz path; do
  mb=$((sz / 1024 / 1024))
  echo "${{mb}}MB $path"
done

echo ''
echo '========== 截断 >10MB 的容器日志 =========='
for f in $(sudo find /var/lib/docker/containers -name '*-json.log' -size +10M 2>/dev/null); do
  sz=$(sudo stat -c%s "$f")
  mb=$((sz / 1024 / 1024))
  echo "truncate ${{mb}}MB: $f"
  sudo truncate -s 0 "$f"
done

echo ''
echo '========== 系统缓存 =========='
sudo apt-get clean -y 2>/dev/null || true
sudo journalctl --vacuum-size=50M 2>/dev/null || true
sudo docker builder prune -a -f 2>/dev/null || true
sudo docker image prune -f 2>/dev/null || true

echo ''
echo '========== 压平 gateway 镜像（日志清理后执行） =========='
AVAIL=$(df / --output=avail -B1 | tail -1)
if [ "$AVAIL" -gt 4000000000 ]; then
  sudo docker save foundry/gateway:latest -o /tmp/gateway-flat.tar
  ls -lh /tmp/gateway-flat.tar
  sudo docker compose -f {COMPOSE} stop gateway-service
  sudo docker rmi -f foundry/gateway:latest 97ca92a1c832 2>&1 || true
  sudo docker load -i /tmp/gateway-flat.tar
  rm -f /tmp/gateway-flat.tar
  sudo docker compose -f {COMPOSE} up -d gateway-service
  sleep 8
else
  echo "skip gateway flatten: avail bytes $AVAIL < 4GB"
  sudo docker compose -f {COMPOSE} up -d gateway-service 2>/dev/null || true
fi

echo ''
echo '========== 清理后 =========='
df -h / | tail -1
sudo docker system df
sudo docker images -a
sudo docker ps --filter name=service-gateway-prod --format '{{{{.Names}}}} {{{{.Status}}}}'
echo -n 'container logs total: '
sudo find /var/lib/docker/containers -name '*-json.log' -exec du -ch {{}} + 2>/dev/null | tail -1 | awk '{{print $1}}'
sudo du -sh /var/lib/docker /var/lib/docker/overlay2 /var/lib/docker/volumes 2>/dev/null
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=600)
print(o.read().decode())
if e.read().decode():
    print("STDERR:", e.read().decode(), file=sys.stderr)
c.close()

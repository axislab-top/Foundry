#!/usr/bin/env python3
"""立即清理服务器磁盘（删除 /tmp 残留 tar、悬空镜像、大日志）。"""
import paramiko

script = r"""
set -e
echo '==> Before'
df -h / | tail -1
ls -lh /tmp/gateway-flat.tar /tmp/foundry-*.tar 2>/dev/null || true

echo ''
echo '==> Remove temp tars'
sudo rm -f /tmp/gateway-flat.tar /tmp/foundry-*.tar /tmp/gateway.tar
sudo find /tmp -maxdepth 1 -name '*.tar' -size +10M -print -delete 2>/dev/null || true
sudo rm -f /opt/foundry/images/*.tar 2>/dev/null || true

echo ''
echo '==> Truncate large docker logs'
for f in $(sudo find /var/lib/docker/containers -name '*-json.log' -size +1M 2>/dev/null); do
  sudo truncate -s 0 "$f"
done

echo ''
echo '==> Docker prune (no volumes)'
sudo docker builder prune -a -f 2>/dev/null || true
sudo docker image prune -f 2>/dev/null || true
for id in $(sudo docker images -f dangling=true -q 2>/dev/null); do
  sudo docker rmi "$id" 2>/dev/null || true
done
sudo docker container prune -f 2>/dev/null || true
sudo apt-get clean -y 2>/dev/null || true
sudo journalctl --vacuum-size=50M 2>/dev/null || true

echo ''
echo '==> After'
df -h / | tail -1
sudo docker system df
ls -lh /tmp/*.tar 2>/dev/null || echo 'no tar in /tmp'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=20)
_, o, e = c.exec_command(script, timeout=180)
print(o.read().decode())
if e.read().decode():
    print(e.read().decode())
c.close()

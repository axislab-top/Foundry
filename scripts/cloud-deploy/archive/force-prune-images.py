#!/usr/bin/env python3
import paramiko

script = r"""
echo '========== 当前镜像 =========='
sudo docker images -a

echo ''
echo '========== 尝试删除旧 gateway 悬空镜像 97ca92a1c832 =========='
sudo docker rmi 97ca92a1c832 2>&1 || true

echo ''
echo '========== 删除所有 dangling =========='
sudo docker image prune -a -f --filter "until=24h" 2>&1 | tail -5

echo ''
echo '========== 强制清理无 tag 镜像 =========='
for id in $(sudo docker images -f "dangling=true" -q); do
  echo "rmi $id"
  sudo docker rmi "$id" 2>&1 || true
done

echo ''
echo '========== 若仍有重复 gateway 层，docker system prune（不含卷） =========='
sudo docker system prune -f

echo ''
echo '========== 结果 =========='
df -h / | tail -1
sudo docker system df
sudo docker images -a
sudo du -sh /var/lib/docker /var/lib/docker/overlay2 /var/lib/docker/volumes
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=180)
print(o.read().decode())
print(e.read().decode())
c.close()

#!/usr/bin/env python3
import paramiko

script = r"""
echo '========== 大目录扫描 =========='
sudo du -sh /var/lib/docker 2>/dev/null
sudo du -sh /opt/foundry/* 2>/dev/null
sudo du -sh /var/log 2>/dev/null
sudo du -sh /var/cache/apt 2>/dev/null

echo ''
echo '========== /var/lib/docker 子目录 =========='
sudo du -sh /var/lib/docker/*/ 2>/dev/null | sort -hr | head -12

echo ''
echo '========== 所有镜像（含中间层） =========='
sudo docker images -a --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}'

echo ''
echo '========== 未被任何容器使用的镜像 =========='
for img in $(sudo docker images -q); do
  used=$(sudo docker ps -a --filter ancestor=$img -q | wc -l)
  if [ "$used" = "0" ]; then
    sudo docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}} {{.Size}}' | grep "^$img" || \
    sudo docker inspect --format '{{.Id}} {{.RepoTags}}' $img 2>/dev/null
  fi
done

echo ''
echo '========== /opt/foundry/images =========='
ls -lh /opt/foundry/images/ 2>/dev/null

echo ''
echo '========== 可安全清理项估算 =========='
echo -n 'images tar: '; du -sh /opt/foundry/images/*.tar 2>/dev/null | awk '{print $1}'
echo -n 'backup dump: '; du -sh /opt/foundry/backup/*.dump 2>/dev/null | awk '{print $1}'
echo -n 'buildx cache: '; sudo docker buildx du 2>/dev/null | grep Total | tail -1
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=180)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err[-3000:])
c.close()

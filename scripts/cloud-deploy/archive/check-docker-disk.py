#!/usr/bin/env python3
"""检查云服务器磁盘与 Docker 占用。"""
import paramiko

script = r"""
echo '========== 磁盘总览 =========='
df -h / /var/lib/docker 2>/dev/null || df -h /

echo ''
echo '========== Docker 磁盘占用 =========='
sudo docker system df -v 2>/dev/null | head -80

echo ''
echo '========== 镜像列表（按大小） =========='
sudo docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}' | head -30

echo ''
echo '========== 悬空镜像 / 构建缓存 =========='
sudo docker images -f dangling=true --format '{{.ID}} {{.Size}}' | wc -l
echo 'dangling images count above'
sudo docker buildx du 2>/dev/null | tail -15 || echo '(no buildx cache info)'

echo ''
echo '========== 容器（含已停止） =========='
sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}'

echo ''
echo '========== 卷 =========='
sudo docker volume ls
sudo docker system df | grep -i volume

echo ''
echo '========== /var/lib/docker 目录大小 =========='
sudo du -sh /var/lib/docker/* 2>/dev/null | sort -hr | head -15
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

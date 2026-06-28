#!/usr/bin/env python3
"""安全清理云服务器 Docker 构建残留与无用镜像。"""
import paramiko
import sys

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

script = rf"""
set -e
cd /opt/foundry

echo '========== 清理前 =========='
df -h / | tail -1
sudo docker system df

echo ''
echo '========== 1. 让 gateway 使用 foundry/gateway:latest 标签（去掉悬空旧镜像依赖） =========='
sudo docker compose -f {COMPOSE} up -d --force-recreate --no-deps gateway-service
sleep 6
sudo docker ps --filter name=service-gateway-prod --format '{{{{.Names}}}} image={{{{.Image}}}} status={{{{.Status}}}}'

echo ''
echo '========== 2. 删除悬空镜像（<none>） =========='
sudo docker image prune -f

echo ''
echo '========== 3. 清理 BuildKit / 构建缓存 =========='
sudo docker builder prune -a -f 2>/dev/null || true
sudo docker buildx prune -a -f 2>/dev/null || true

echo ''
echo '========== 4. 清理已停止容器、无用网络（不删卷） =========='
sudo docker container prune -f
sudo docker network prune -f

echo ''
echo '========== 5. 删除未被任何容器引用的旧镜像 =========='
# 仅 prune dangling + 明确无 tag 的重复层
sudo docker images -f dangling=true -q | xargs -r sudo docker rmi -f 2>/dev/null || true

echo ''
echo '========== 6. 系统缓存（apt / journal） =========='
sudo apt-get clean -y 2>/dev/null || true
sudo journalctl --vacuum-size=100M 2>/dev/null || true

echo ''
echo '========== 7. 删除已加载的镜像 tar（images 目录已空则跳过） =========='
if ls /opt/foundry/images/*.tar 1>/dev/null 2>&1; then
  rm -f /opt/foundry/images/*.tar
  echo 'removed image tarballs'
else
  echo 'no image tarballs to remove'
fi

echo ''
echo '========== 清理后 =========='
df -h / | tail -1
sudo docker system df
echo ''
echo '剩余镜像:'
sudo docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}'
echo ''
echo 'Docker 目录:'
sudo du -sh /var/lib/docker 2>/dev/null
sudo du -sh /var/lib/docker/volumes /var/lib/docker/overlay2 /var/lib/docker/buildkit 2>/dev/null || true
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
print("Running safe Docker cleanup on server...")
_, o, e = c.exec_command(script, timeout=300)
out = o.read().decode()
err = e.read().decode()
print(out)
if err:
    print("STDERR:", err, file=sys.stderr)
c.close()

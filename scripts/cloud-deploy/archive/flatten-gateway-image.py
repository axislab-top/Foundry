#!/usr/bin/env python3
"""压平 gateway 镜像层叠并清理容器日志。"""
import paramiko

COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"

script = f"""
set -e
cd /opt/foundry

echo '========== 容器日志大小 =========='
sudo find /var/lib/docker/containers -name '*-json.log' -exec du -ch {{}} + 2>/dev/null | tail -5

echo ''
echo '========== 压平 gateway 镜像（去除 commit 父子层） =========='
sudo docker save foundry/gateway:latest -o /tmp/gateway-flat.tar
ls -lh /tmp/gateway-flat.tar

sudo docker compose -f {COMPOSE} stop gateway-service
sudo docker rmi -f foundry/gateway:latest 97ca92a1c832 2>&1 || true
sudo docker load -i /tmp/gateway-flat.tar
rm -f /tmp/gateway-flat.tar

sudo docker compose -f {COMPOSE} up -d gateway-service
sleep 8

echo ''
echo '========== 截断过大容器日志（>50MB） =========='
for f in $(sudo find /var/lib/docker/containers -name '*-json.log' -size +50M 2>/dev/null); do
  echo "truncate $f"
  sudo truncate -s 0 "$f"
done

echo ''
echo '========== 清理后 =========='
df -h / | tail -1
sudo docker images -a
sudo docker system df
sudo du -sh /var/lib/docker /var/lib/docker/overlay2 /var/lib/docker/volumes 2>/dev/null
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
print("Flattening gateway image layers...")
_, o, e = c.exec_command(script, timeout=600)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
c.close()

#!/usr/bin/env python3
"""在腾讯云服务器执行重建前清理（可传服务名: gateway/api/worker/...）。"""
import sys
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
TARGET = sys.argv[1] if len(sys.argv) > 1 else ""

script = r"""
set -e
cd /opt/foundry
chmod +x scripts/cloud-deploy/cleanup-server-before-rebuild.sh 2>/dev/null || true
if [[ -f scripts/cloud-deploy/cleanup-server-before-rebuild.sh ]]; then
  bash scripts/cloud-deploy/cleanup-server-before-rebuild.sh __TARGET__
else
  echo '==> inline cleanup (script not on server yet)'
  df -h / | tail -1
  sudo rm -f /tmp/foundry-*.tar /tmp/gateway-flat.tar /tmp/gateway.tar /tmp/*.tar 2>/dev/null || true
  sudo find /tmp -maxdepth 1 -name '*.tar' -size +50M -delete 2>/dev/null || true
  sudo rm -f /opt/foundry/images/*.tar 2>/dev/null || true
  for f in $(sudo find /var/lib/docker/containers -name '*-json.log' -size +10M 2>/dev/null); do
    sudo truncate -s 0 "$f"
  done
  sudo docker builder prune -a -f 2>/dev/null || true
  sudo docker image prune -f 2>/dev/null || true
  while read -r id; do sudo docker rmi "$id" 2>/dev/null || true; done < <(sudo docker images -f dangling=true -q)
  sudo docker container prune -f 2>/dev/null || true
  sudo apt-get clean -y 2>/dev/null || true
  df -h / | tail -1
fi
""".replace("__TARGET__", TARGET)

# 上传清理脚本
import os
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
local_sh = os.path.join(REPO, "scripts/cloud-deploy/cleanup-server-before-rebuild.sh")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)
sftp = c.open_sftp()
try:
    sftp.mkdir("/opt/foundry/scripts/cloud-deploy")
except OSError:
    pass
sftp.put(local_sh, "/opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh")
# 确保 LF 换行（避免 Windows CRLF 导致 bash 报错）
c.exec_command(
    "sed -i 's/\\r$//' /opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh && "
    "chmod +x /opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh",
    timeout=15,
)[1].read()
sftp.close()

_, o, e = c.exec_command(script, timeout=300)
print(o.read().decode())
err = e.read().decode()
if err:
    print(err, file=sys.stderr)
c.close()

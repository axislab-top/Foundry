#!/usr/bin/env python3
"""仅构建并部署 foundry/gateway 镜像到腾讯云服务器。"""
import os
import subprocess
import sys
import tempfile
import time

import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"
IMAGE = "foundry/gateway:latest"


def run(cmd, cwd=REPO, check=True):
    print(f">>> {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    if check and r.returncode != 0:
        sys.exit(r.returncode)
    return r.returncode


def main():
    print("==> Building gateway image locally")
    run(f'docker build -f apps/gateway/Dockerfile -t {IMAGE} .')

    with tempfile.TemporaryDirectory() as tmp:
        tar_path = os.path.join(tmp, "gateway.tar")
        print("==> Exporting image")
        run(f"docker save -o {tar_path} {IMAGE}")

        print("==> Uploading to server")
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
        sftp = c.open_sftp()
        remote_tar = "/tmp/foundry-gateway.tar"
        sftp.put(tar_path, remote_tar)
        sftp.close()

        script = f"""
set -e
cd /opt/foundry
echo '==> Pre-rebuild cleanup (free disk before load)'
bash scripts/cloud-deploy/cleanup-server-before-rebuild.sh gateway 2>/dev/null || {{
  rm -f /tmp/foundry-*.tar /tmp/gateway-flat.tar
  sudo docker rmi -f {IMAGE} 2>/dev/null || true
}}
echo '==> Loading gateway image'
sudo docker load -i {remote_tar}
rm -f {remote_tar}
echo '==> Recreating gateway-service only'
sudo docker compose -f {COMPOSE} up -d --force-recreate --no-deps gateway-service
sleep 8
sudo docker ps --filter name=service-gateway-prod --format '{{{{.Names}}}} {{{{.Status}}}}'
df -h / | tail -1
echo '==> Health check'
curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:3002/api/health || true
echo ''
"""
        _, stdout, stderr = c.exec_command(script, timeout=300)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(out)
        if err:
            print(err, file=sys.stderr)
        c.close()

    print("==> Verifying auth login (invalid creds should return 401 JSON)")
    time.sleep(2)
    verify = r'''
import json, urllib.request, urllib.error, ssl
ctx = ssl.create_default_context()
body = json.dumps({"email":"nobody@example.com","password":"wrongpass1"}).encode()
req = urllib.request.Request("https://axislab.top/api/auth/login", data=body,
    headers={"Content-Type":"application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        print("status", resp.status, resp.read().decode()[:300])
except urllib.error.HTTPError as e:
    print("status", e.code, e.read().decode()[:300])
'''
    subprocess.run([sys.executable, "-c", verify], check=False)


if __name__ == "__main__":
    main()

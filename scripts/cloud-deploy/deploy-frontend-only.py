#!/usr/bin/env python3
"""
仅更新前端（client + admin）到腾讯云。
前端静态资源打包在 foundry/nginx 镜像内，只需重建并部署 nginx 服务。
"""
import gzip
import os
import subprocess
import sys

import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"
PUBLIC_ORIGIN = "https://axislab.top"
IMAGE = "foundry/nginx:latest"
DOCKERFILE = "infrastructure/nginx/Dockerfile"
SERVICE = "nginx"


def ssh_exec(client, script, timeout=300):
    _, stdout, stderr = client.exec_command(script, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out:
        print(out)
    if err.strip():
        print(err, file=sys.stderr)
    return out


def main():
    # 1) 本地构建 nginx（内含 client + admin 的 vite build）
    build_cmd = (
        f"docker build -f {DOCKERFILE} "
        f"--build-arg VITE_PUBLIC_ORIGIN={PUBLIC_ORIGIN} "
        f"--build-arg NPM_REGISTRY=https://registry.npmmirror.com "
        f"-t {IMAGE} ."
    )
    print(f">>> {build_cmd}")
    if subprocess.run(build_cmd, shell=True, cwd=REPO).returncode != 0:
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    # 2) 服务器清理旧 nginx 镜像与临时包
    print("\n==> 清理旧 nginx")
    ssh_exec(
        client,
        f"""
set -e
cd /opt/foundry
sudo docker compose -f {COMPOSE} stop {SERVICE} 2>/dev/null || true
sudo docker rmi -f {IMAGE} 2>/dev/null || true
sudo rm -f /tmp/foundry-nginx.tar.gz 2>/dev/null || true
df -h / | tail -1
""",
    )

    # 3) 上传并加载
    local_tar = os.path.join(REPO, "scripts", "cloud-deploy", ".tmp-nginx.tar.gz")
    remote_tar = "/tmp/foundry-nginx.tar.gz"
    print("\n==> 导出并上传 nginx 镜像")
    proc = subprocess.Popen(["docker", "save", IMAGE], stdout=subprocess.PIPE, cwd=REPO)
    with gzip.open(local_tar, "wb", compresslevel=1) as gz:
        while True:
            chunk = proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            gz.write(chunk)
    proc.wait()
    if proc.returncode != 0:
        sys.exit("docker save failed")

    size_mb = os.path.getsize(local_tar) / 1024 / 1024
    print(f"    tar.gz: {size_mb:.0f} MB")

    sftp = client.open_sftp()
    sftp.put(local_tar, remote_tar)
    sftp.close()
    os.remove(local_tar)

    # 4) 重建 nginx 容器
    print("\n==> 部署 nginx")
    ssh_exec(
        client,
        f"""
set -e
cd /opt/foundry
gunzip -c {remote_tar} | sudo docker load
rm -f {remote_tar}
sudo docker compose -f {COMPOSE} up -d --force-recreate --no-deps {SERVICE}
sleep 8
sudo docker ps --filter name=nginx --format 'table {{{{.Names}}}}\t{{{{.Status}}}}'
curl -sf http://127.0.0.1/health && echo ' OK' || echo ' FAIL'
curl -sf http://127.0.0.1/ | head -c 80 && echo
df -h / | tail -1
""",
    )
    client.close()
    print(f"\n完成。请访问 {PUBLIC_ORIGIN} （必要时 Ctrl+Shift+R 强刷）")


if __name__ == "__main__":
    main()

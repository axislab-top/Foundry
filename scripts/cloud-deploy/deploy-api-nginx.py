#!/usr/bin/env python3
"""部署 api + nginx（含 client 预算页改动）到腾讯云。"""
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

SERVICES = [
    ("foundry/api:latest", "apps/api/Dockerfile", "api-service"),
    ("foundry/nginx:latest", "infrastructure/nginx/Dockerfile", "nginx"),
]


def run(cmd, cwd=REPO):
    print(f"\n>>> {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    if r.returncode != 0:
        sys.exit(r.returncode)


def deploy_one(client, image, compose_service):
    short = image.split("/")[1].split(":")[0]
    remote_tar = f"/tmp/foundry-{short}.tar.gz"
    local_tar = os.path.join(REPO, "scripts", "cloud-deploy", f".tmp-{short}.tar.gz")

    print(f"\n==> Export {image}")
    proc = subprocess.Popen(["docker", "save", image], stdout=subprocess.PIPE, cwd=REPO)
    with gzip.open(local_tar, "wb", compresslevel=1) as gz:
        while True:
            chunk = proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            gz.write(chunk)
    proc.wait()
    if proc.returncode != 0:
        sys.exit(f"docker save failed: {image}")

    print(f"==> Upload {short} ({os.path.getsize(local_tar)/1024/1024:.0f} MB)")
    sftp = client.open_sftp()
    sftp.put(local_tar, remote_tar)
    sftp.close()
    os.remove(local_tar)

    script = f"""
set -e
cd /opt/foundry
sudo docker compose -f {COMPOSE} stop {compose_service} 2>/dev/null || true
sudo docker rmi -f {image} 2>/dev/null || true
gunzip -c {remote_tar} | sudo docker load
rm -f {remote_tar}
sudo docker compose -f {COMPOSE} up -d --force-recreate --no-deps {compose_service}
sleep 12
sudo docker ps --filter name={short} --format '{{{{.Names}}}} {{{{.Status}}}}'
"""
    _, o, _ = client.exec_command(script, timeout=600)
    print(o.read().decode(errors="replace"))


def main():
    for image, dockerfile, _ in SERVICES:
        if "nginx" in dockerfile:
            run(
                f'docker build -f {dockerfile} '
                f'--build-arg VITE_PUBLIC_ORIGIN={PUBLIC_ORIGIN} '
                f'--build-arg NPM_REGISTRY=https://registry.npmmirror.com '
                f'-t {image} .'
            )
        else:
            run(f"docker build -f {dockerfile} -t {image} .")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    for image, _, svc in SERVICES:
        deploy_one(client, image, svc)

    _, o, _ = client.exec_command(
        f"cd /opt/foundry && sudo docker compose -f {COMPOSE} up -d && sleep 10 && curl -sf http://127.0.0.1/api/health",
        timeout=120,
    )
    print(o.read().decode(errors="replace"))
    client.close()
    print("\nDone.")


if __name__ == "__main__":
    main()

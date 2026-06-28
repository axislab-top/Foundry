#!/usr/bin/env python3
"""
逐个构建并部署 api / gateway / worker / nginx(client) 到腾讯云。
流程：服务器清理 → 本地 docker build → 逐个 save/upload/load → recreate 服务
"""
import gzip
import io
import os
import subprocess
import sys
import time

import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"
PUBLIC_ORIGIN = "https://axislab.top"

# (image_name, dockerfile, compose_service)
SERVICES = [
    ("foundry/api:latest", "apps/api/Dockerfile", "api-service", []),
    ("foundry/worker:latest", "apps/worker/Dockerfile", "worker-service", []),
    (
        "foundry/gateway:latest",
        "apps/gateway/Dockerfile",
        "gateway-service",
        ["api-service", "webhooks-service", "worker-service"],
    ),
    (
        "foundry/nginx:latest",
        "infrastructure/nginx/Dockerfile",
        "nginx",
        ["gateway-service"],
    ),
]


def run(cmd, cwd=REPO, check=True):
    print(f"\n>>> {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    if check and r.returncode != 0:
        sys.exit(r.returncode)
    return r.returncode


def ssh_exec(client, script, timeout=600):
    _, stdout, stderr = client.exec_command(script, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out:
        print(out)
    if err.strip():
        print(err, file=sys.stderr)
    return out


def server_cleanup(client, target_services):
    names = " ".join(target_services)
    script = f"""
set -e
cd /opt/foundry

echo '========== DISK BEFORE =========='
df -h / | tail -1

echo ''
echo '========== Stop target services =========='
sudo docker compose -f {COMPOSE} stop {names} 2>/dev/null || true

echo ''
echo '========== Remove old foundry images (api/gateway/worker/nginx) =========='
for img in foundry/api:latest foundry/worker:latest foundry/gateway:latest foundry/nginx:latest; do
  sudo docker rmi -f "$img" 2>/dev/null || true
done
sudo docker images -f dangling=true -q | xargs -r sudo docker rmi -f 2>/dev/null || true

echo ''
echo '========== Clean logs & temp files =========='
sudo rm -f /tmp/foundry-*.tar /tmp/gateway*.tar /tmp/*.tar.gz 2>/dev/null || true
for f in $(sudo find /var/lib/docker/containers -name '*-json.log' 2>/dev/null); do
  sudo truncate -s 0 "$f" 2>/dev/null || true
done
sudo docker builder prune -a -f 2>/dev/null || true
sudo docker image prune -f 2>/dev/null || true
sudo apt-get clean -y 2>/dev/null || true
sudo journalctl --vacuum-size=30M 2>/dev/null || true

echo ''
echo '========== Ensure LOG_LEVEL=warn on server =========='
ENV_FILE=deployment/docker/.env
grep -q '^LOG_LEVEL=' "$ENV_FILE" && sed -i 's/^LOG_LEVEL=.*/LOG_LEVEL=warn/' "$ENV_FILE" || echo 'LOG_LEVEL=warn' >> "$ENV_FILE"
grep -q '^DB_LOGGING=' "$ENV_FILE" && sed -i 's/^DB_LOGGING=.*/DB_LOGGING=false/' "$ENV_FILE" || echo 'DB_LOGGING=false' >> "$ENV_FILE"

echo ''
echo '========== DISK AFTER CLEANUP =========='
df -h / | tail -1
sudo docker system df 2>/dev/null || true
"""
    ssh_exec(client, script, timeout=300)


def build_image(image, dockerfile, extra_args=""):
    if "nginx" in dockerfile:
        run(
            f'docker build -f {dockerfile} '
            f'--build-arg VITE_PUBLIC_ORIGIN={PUBLIC_ORIGIN} '
            f'--build-arg NPM_REGISTRY=https://registry.npmmirror.com '
            f'{extra_args} -t {image} .'
        )
    else:
        run(f"docker build -f {dockerfile} {extra_args} -t {image} .")


def deploy_one(client, image, compose_service, depends_ok=True):
    short = image.split("/")[1].split(":")[0]
    remote_tar = f"/tmp/foundry-{short}.tar.gz"
    local_tar = os.path.join(REPO, "scripts", "cloud-deploy", f".tmp-{short}.tar.gz")

    print(f"\n==> Export {image} (gzip)")
    os.makedirs(os.path.dirname(local_tar), exist_ok=True)
    proc = subprocess.Popen(
        ["docker", "save", image],
        stdout=subprocess.PIPE,
        cwd=REPO,
    )
    with gzip.open(local_tar, "wb", compresslevel=1) as gz:
        while True:
            chunk = proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            gz.write(chunk)
    proc.wait()
    if proc.returncode != 0:
        sys.exit(f"docker save failed for {image}")

    size_mb = os.path.getsize(local_tar) / 1024 / 1024
    print(f"    tar.gz size: {size_mb:.0f} MB")

    print(f"==> Upload {short}")
    sftp = client.open_sftp()
    sftp.put(local_tar, remote_tar)
    sftp.close()
    os.remove(local_tar)

    script = f"""
set -e
cd /opt/foundry
echo '==> Load {image}'
gunzip -c {remote_tar} | sudo docker load
rm -f {remote_tar}
echo '==> Recreate {compose_service}'
sudo docker compose -f {COMPOSE} up -d --force-recreate --no-deps {compose_service}
sleep 10
sudo docker ps --filter name=service-{short} --format '{{{{.Names}}}} {{{{.Status}}}}' 2>/dev/null | head -3 || true
df -h / | tail -1
"""
    ssh_exec(client, script, timeout=600)


def main():
    # 1) 本地生产 env 对齐（LOG_LEVEL=warn 等）
    run(
        f'powershell -NoProfile -ExecutionPolicy Bypass -File "{os.path.join(REPO, "scripts/cloud-deploy/prepare-env.ps1")}"',
        check=False,
    )

    target = [s[2] for s in SERVICES]
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    print("==> Phase 1: Server cleanup")
    server_cleanup(client, target)

    # 上传 compose + 生产 env
    sftp = client.open_sftp()
    local_compose = os.path.join(REPO, COMPOSE)
    sftp.put(local_compose, f"/opt/foundry/{COMPOSE}")
    local_env = os.path.join(REPO, "deployment/docker/.env")
    if os.path.isfile(local_env):
        sftp.put(local_env, "/opt/foundry/deployment/docker/.env")
        print("Uploaded deployment/docker/.env (LOG_LEVEL=warn, production keys)")
    sftp.close()

    print("\n==> Phase 2: Local docker build (4 images)")
    for image, dockerfile, _, _ in SERVICES:
        build_image(image, dockerfile)

    print("\n==> Phase 3: Deploy one-by-one to server")
    for image, _, compose_service, _ in SERVICES:
        deploy_one(client, image, compose_service)

    print("\n==> Phase 4: Final health check")
    ssh_exec(
        client,
        f"""
cd /opt/foundry
sudo docker compose -f {COMPOSE} up -d
sleep 15
sudo docker ps --format 'table {{{{.Names}}}}\t{{{{.Status}}}}'
curl -sf http://127.0.0.1/health && echo ' nginx OK' || echo ' nginx FAIL'
curl -sf http://127.0.0.1:3002/api/health && echo ' gateway OK' || echo ' gateway FAIL'
curl -sf http://127.0.0.1:3000/api/health && echo ' api OK' || echo ' api FAIL'
for svc in service-api-prod service-gateway-prod service-worker-prod; do
  echo -n "$svc LOG_LEVEL="; sudo docker exec $svc printenv LOG_LEVEL 2>/dev/null
done
df -h / | tail -1
""",
        timeout=180,
    )
    client.close()
    print("\nDone. https://axislab.top")


if __name__ == "__main__":
    main()

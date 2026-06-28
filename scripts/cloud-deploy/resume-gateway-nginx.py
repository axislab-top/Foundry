#!/usr/bin/env python3
"""Resume deploy: aggressive disk cleanup + deploy gateway & nginx only."""
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

REMAINING = [
    ("foundry/gateway:latest", "gateway-service"),
    ("foundry/nginx:latest", "nginx"),
]


def ssh_exec(client, script, timeout=600):
    _, stdout, stderr = client.exec_command(script, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if out:
        print(out)
    if err.strip():
        print(err, file=sys.stderr)
    return out


def deploy_one(client, image, compose_service):
    short = image.split("/")[1].split(":")[0]
    remote_tar = f"/tmp/foundry-{short}.tar.gz"
    local_tar = os.path.join(REPO, "scripts", "cloud-deploy", f".tmp-{short}.tar.gz")

    print(f"\n==> Export {image}")
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
    print(f"    tar.gz: {size_mb:.0f} MB")

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
sleep 12
sudo docker ps --filter name={short} --format '{{{{.Names}}}} {{{{.Status}}}}' 2>/dev/null | head -3
df -h / | tail -1
"""
    ssh_exec(client, script, timeout=600)


def main():
    # verify local images exist
    for image, _ in REMAINING:
        r = subprocess.run(["docker", "image", "inspect", image], capture_output=True)
        if r.returncode != 0:
            print(f"Missing local image {image}, build first")
            sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    print("==> Aggressive server cleanup")
    ssh_exec(
        client,
        f"""
set -e
cd /opt/foundry
echo '=== DISK BEFORE ==='
df -h / | tail -1

sudo docker compose -f {COMPOSE} stop gateway-service nginx 2>/dev/null || true
sudo docker rmi -f foundry/gateway:latest foundry/nginx:latest 2>/dev/null || true

sudo rm -rf /tmp/foundry-*.tar.gz /tmp/foundry-*.tar /tmp/gateway*.tar /tmp/*.tar 2>/dev/null || true
sudo rm -rf /tmp/builder-pnpm 2>/dev/null || true

for f in $(sudo find /var/lib/docker/containers -name '*-json.log' 2>/dev/null); do
  sudo truncate -s 0 "$f" 2>/dev/null || true
done

sudo docker builder prune -a -f 2>/dev/null || true
sudo docker image prune -a -f 2>/dev/null || true
sudo docker system prune -f 2>/dev/null || true
sudo journalctl --vacuum-size=20M 2>/dev/null || true
sudo apt-get clean -y 2>/dev/null || true

echo '=== DISK AFTER ==='
df -h / | tail -1
sudo docker system df 2>/dev/null || true
""",
        timeout=300,
    )

    for image, svc in REMAINING:
        deploy_one(client, image, svc)

    print("\n==> Health check")
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

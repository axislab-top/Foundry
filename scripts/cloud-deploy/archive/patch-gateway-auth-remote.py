#!/usr/bin/env python3
"""将本地 gateway dist 热补丁部署到生产容器（无需本地 Docker）。"""
import os
import sys
import tempfile

import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
CONTAINER = "service-gateway-prod"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DIST = os.path.join(REPO, "apps/gateway/dist")

PATCH_FILES = [
    "common/resilience/interceptors/circuit-breaker.interceptor.js",
    "modules/auth/auth.controller.js",
    "main.js",
]


def main():
    missing = [f for f in PATCH_FILES if not os.path.isfile(os.path.join(DIST, f))]
    if missing:
        print("Missing dist files, run: pnpm --filter gateway build")
        for f in missing:
            print(" -", f)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = c.open_sftp()

    with tempfile.TemporaryDirectory() as tmp:
        remote_dir = "/tmp/gateway-patch"
        c.exec_command(f"mkdir -p {remote_dir}")[1].read()

        for rel in PATCH_FILES:
            local_path = os.path.join(DIST, rel)
            remote_path = f"{remote_dir}/{rel.replace('/', '_')}"
            sftp.put(local_path, remote_path)
            container_path = f"/app/apps/gateway/dist/{rel}"
            cmd = (
                f"sudo docker cp {remote_path} {CONTAINER}:{container_path}"
            )
            print(f">>> {cmd}")
            _, o, e = c.exec_command(cmd, timeout=60)
            out, err = o.read().decode(), e.read().decode()
            if out:
                print(out)
            if err:
                print(err, file=sys.stderr)

    sftp.close()

    script = f"""
set -e
echo '==> Restart gateway'
sudo docker restart {CONTAINER}
sleep 10
sudo docker ps --filter name={CONTAINER} --format '{{{{.Names}}}} {{{{.Status}}}}'

echo '==> Commit patched image'
sudo docker commit {CONTAINER} foundry/gateway:latest

echo '==> Test invalid login'
curl -s -i -X POST http://127.0.0.1:3002/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{{"email":"nobody@example.com","password":"wrongpass1"}}' | head -20
"""
    _, o, e = c.exec_command(script, timeout=120)
    print(o.read().decode())
    err = e.read().decode()
    if err:
        print(err, file=sys.stderr)
    c.close()


if __name__ == "__main__":
    main()

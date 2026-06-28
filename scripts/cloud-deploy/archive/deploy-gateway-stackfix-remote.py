#!/usr/bin/env python3
"""部署 Gateway 栈溢出/注册错误映射修复到腾讯云（清理旧构建 + 热补丁 dist + 重启）。"""
import os
import sys
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"
CONTAINER = "service-gateway-prod"

# 本次修复涉及的 dist 文件
PATCH_FILES = [
    "common/security/services/data-masking.service.js",
    "modules/audit/services/audit.service.js",
    "common/interceptors/logging.interceptor.js",
    "common/resilience/interceptors/circuit-breaker.interceptor.js",
    "modules/auth/auth.service.js",
    "modules/auth/auth.controller.js",
    "main.js",
]

LOGGING_PATCH = [
    "infrastructure/logging/dist/log-level-env.js",
    "infrastructure/logging/dist/index.js",
]

LOCAL_SH = os.path.join(REPO, "scripts/cloud-deploy/cleanup-server-before-rebuild.sh")


def main():
    dist_root = os.path.join(REPO, "apps/gateway/dist")
    missing = [f for f in PATCH_FILES if not os.path.isfile(os.path.join(dist_root, f))]
    if missing:
        print("请先构建 gateway: pnpm --filter @service/gateway build")
        for f in missing:
            print("  missing:", f)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = c.open_sftp()

    # 上传清理脚本
    try:
        sftp.mkdir("/opt/foundry/scripts/cloud-deploy")
    except OSError:
        pass
    sftp.put(LOCAL_SH, "/opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh")
    c.exec_command(
        "sed -i 's/\\r$//' /opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh && "
        "chmod +x /opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh",
        timeout=15,
    )[1].read()

    print("==> 1. 清理旧构建残留（含 /tmp tar）")
    _, o, _ = c.exec_command(
        "bash /opt/foundry/scripts/cloud-deploy/cleanup-server-before-rebuild.sh",
        timeout=180,
    )
    print(o.read().decode())

    print("==> 2. 上传补丁到 /tmp")
    for rel in PATCH_FILES:
        local_path = os.path.join(dist_root, rel)
        remote_tmp = f"/tmp/gw_{rel.replace('/', '_')}"
        sftp.put(local_path, remote_tmp)
        print(f"  uploaded {rel}")
    for rel in LOGGING_PATCH:
        local_path = os.path.join(REPO, rel.replace("/", os.sep))
        if os.path.isfile(local_path):
            remote_tmp = f"/tmp/gw_{rel.replace('/', '_')}"
            sftp.put(local_path, remote_tmp)
            print(f"  uploaded {rel}")
    sftp.close()

    script = f"""
set -e
cd /opt/foundry
echo '==> 3. 重建 gateway 容器'
sudo docker compose -f {COMPOSE} up -d --force-recreate --no-deps gateway-service
sleep 10

echo '==> 4. 注入补丁到新容器'
"""
    for rel in PATCH_FILES:
        remote_tmp = f"/tmp/gw_{rel.replace('/', '_')}"
        container_path = f"/app/apps/gateway/dist/{rel}"
        script += f"sudo docker cp {remote_tmp} {CONTAINER}:{container_path}\n"
    for rel in LOGGING_PATCH:
        remote_tmp = f"/tmp/gw_{rel.replace('/', '_')}"
        script += f"sudo docker cp {remote_tmp} {CONTAINER}:/app/{rel} 2>/dev/null || true\n"

    script += f"""
echo '==> 5. 重启 gateway 使补丁生效'
sudo docker restart {CONTAINER}
sleep 12
sudo docker ps --filter name={CONTAINER} --format '{{{{.Names}}}} {{{{.Status}}}}'

echo ''
echo '==> 6. 验证注册错误返回（应 JSON 4xx，非栈溢出）'
curl -s -i -X POST http://127.0.0.1:3002/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{{"username":"testuser","email":"newtest@example.com","password":"TestPass123!"}}' | head -15
echo ''
df -h / | tail -1
"""
    _, o, e = c.exec_command(script, timeout=180)
    print(o.read().decode())
    err = e.read().decode()
    if err:
        print("STDERR:", err, file=sys.stderr)
    c.close()
    print("==> 完成。请在前端重试注册，应看到真实错误信息。")


if __name__ == "__main__":
    main()

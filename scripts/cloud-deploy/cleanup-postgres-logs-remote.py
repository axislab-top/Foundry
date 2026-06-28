#!/usr/bin/env python3
"""清理 Postgres 历史 SQL 日志并应用生产 logging 配置。"""
import os
import paramiko

HOST = "101.43.9.37"
USER = "ubuntu"
PASSWORD = "right123.."
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
COMPOSE = "deployment/cloud/tencent-lighthouse/compose.standalone.yml"
PG_CONF = "infrastructure/postgres/config/postgresql.conf"
LOG_DIR = "/var/lib/docker/volumes/tencent-lighthouse_postgres-data/_data/18/docker/log"

script = f"""
set -e
cd /opt/foundry
LOGDIR='{LOG_DIR}'

echo '========== 清理前 =========='
df -h / | tail -1
sudo test -d "$LOGDIR" && echo "log dir size: $(sudo du -sh "$LOGDIR" | cut -f1)" || echo 'no log dir'
sudo test -d "$LOGDIR" && echo "log files: $(sudo find "$LOGDIR" -type f 2>/dev/null | wc -l)" || true

echo ''
echo '========== 停止 Postgres 后删除日志（避免占用已删除文件的 inode）=========='
sudo docker compose -f {COMPOSE} stop postgres
sudo find "$LOGDIR" -type f -name '*.log' -delete 2>/dev/null || true
sudo rmdir "$LOGDIR" 2>/dev/null || true

echo ''
echo '========== 启动 Postgres（logging_collector=off）=========='
sudo docker compose -f {COMPOSE} start postgres
sleep 10
sudo docker compose -f {COMPOSE} ps postgres

echo ''
echo '========== 验证配置 =========='
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW logging_collector;"
sudo docker exec service-postgres-prod psql -U postgres -c "SHOW log_statement;"

echo ''
echo '========== 清理后 =========='
df -h / | tail -1
sudo du -sh /var/lib/docker/volumes/tencent-lighthouse_postgres-data/_data 2>/dev/null
sudo test -d "$LOGDIR" && sudo du -sh "$LOGDIR" || echo 'log dir removed'
"""


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    # 上传新 postgresql.conf（若尚未上传）
    sftp = client.open_sftp()
    local_conf = os.path.join(REPO, PG_CONF)
    remote_conf = f"/opt/foundry/{PG_CONF}"
    sftp.put(local_conf, remote_conf)
    sftp.close()
    print(f"Uploaded {PG_CONF}")

    _, stdout, stderr = client.exec_command(script, timeout=600)
    print(stdout.read().decode(errors="replace"))
    err = stderr.read().decode(errors="replace")
    if err.strip():
        print(err)
    client.close()


if __name__ == "__main__":
    main()

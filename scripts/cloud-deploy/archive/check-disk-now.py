#!/usr/bin/env python3
"""检查服务器磁盘与 Docker 占用。"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=20)
_, o, _ = c.exec_command(
    "df -h /; echo '---'; sudo docker system df; echo '---'; "
    "sudo docker ps -a --format '{{.Names}} {{.Status}}' | head -12; echo '---'; "
    "ls -lh /opt/foundry/images/ /tmp/*.tar 2>/dev/null; "
    "sudo du -sh /var/lib/docker/overlay2 /var/lib/docker/volumes /tmp 2>/dev/null",
    timeout=60,
)
print(o.read().decode())
c.close()

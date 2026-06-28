#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=15)
_, o, _ = c.exec_command(
    "df -h / | tail -1; sudo docker ps --format '{{.Names}} {{.Status}}' | head -9; "
    "sudo docker exec service-api-prod printenv LOG_LEVEL; "
    "sudo docker inspect service-api-prod --format '{{.HostConfig.LogConfig.Type}} max={{index .HostConfig.LogConfig.Config \"max-size\"}}'",
    timeout=30,
)
print(o.read().decode())
c.close()

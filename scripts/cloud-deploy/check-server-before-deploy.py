#!/usr/bin/env python3
"""部署前检查服务器磁盘与各服务配置。"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=20)

script = r"""
echo '=== DISK ==='
df -h / | tail -1
du -sh /tmp /var/lib/docker 2>/dev/null

echo ''
echo '=== IMAGES ==='
sudo docker images foundry/* --format '{{.Repository}}:{{.Tag}} {{.Size}}'

echo ''
echo '=== ENV (key vars) ==='
for svc in service-api-prod service-gateway-prod service-worker-prod; do
  echo "--- $svc ---"
  sudo docker exec $svc printenv 2>/dev/null | grep -E '^(LOG_LEVEL|DB_LOGGING|NODE_ENV|CORS_ORIGIN|API_SERVICE|DB_DATABASE|DB_HOST)=' | sort || echo down
done

echo ''
echo '=== deployment/docker/.env on server ==='
grep -E '^(LOG_LEVEL|DB_LOGGING|NODE_ENV|CORS_ORIGIN|VITE_PUBLIC|JWT_|SMTP_)' /opt/foundry/deployment/docker/.env 2>/dev/null | sed 's/SMTP_PASS=.*/SMTP_PASS=***/' | sed 's/JWT_.*=.*/&=***/' || echo missing
"""

_, o, _ = c.exec_command(script, timeout=60)
print(o.read().decode())
c.close()

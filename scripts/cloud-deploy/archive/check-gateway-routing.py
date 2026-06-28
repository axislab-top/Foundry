import paramiko

script = r"""
echo '=== gateway service URLs ==='
sudo docker exec service-gateway-prod printenv | grep -E 'API_SERVICE|WEBHOOKS|WORKER' | sort

echo ''
echo '=== test API validate from gateway container ==='
sudo docker exec service-gateway-prod wget -S -O- --post-data='{"email":"nobody@example.com","password":"wrongpass1"}' \
  --header='Content-Type: application/json' \
  http://api-service:3000/api/auth/validate 2>&1 | tail -15

echo ''
echo '=== gateway_db legacy auth routes ==='
sudo docker exec service-postgres-prod psql -U postgres -d gateway_db -tAc "SELECT path, service, transport, enabled FROM routes WHERE path LIKE '%auth%' LIMIT 20;" 2>/dev/null || \
sudo docker exec service-postgres-prod psql -U postgres -d gateway_db -c "\dt" 2>&1 | head -20
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=90)
print(o.read().decode())
c.close()

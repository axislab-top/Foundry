import paramiko

script = r"""
echo '=== sample users ==='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -tAc "SELECT email, username FROM users ORDER BY created_at DESC LIMIT 5;"

echo ''
echo '=== API validate test (gateway->api) ==='
sudo docker exec service-gateway-prod wget -qO- --post-data='{"email":"979737992@qq.com","password":"wrong"}' \
  --header='Content-Type: application/json' \
  http://service-api-prod:3001/api/auth/validate 2>&1 | head -c 200
echo ''
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=60)
print(o.read().decode())
c.close()

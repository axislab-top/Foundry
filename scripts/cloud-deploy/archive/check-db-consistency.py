import paramiko

script = r"""
echo '=== env in containers ==='
for svc in service-api-prod service-gateway-prod service-worker-prod; do
  echo "--- $svc ---"
  sudo docker exec $svc printenv | grep -E '^(DB_|POSTGRES_|GATEWAY_)' | sort
done

echo ''
echo '=== postgres databases ==='
sudo docker exec service-postgres-prod psql -U postgres -tAc "SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY 1;"

echo ''
echo '=== row counts ==='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -tAc "SELECT 'service_db.users', count(*) FROM users;"
sudo docker exec service-postgres-prod psql -U postgres -d gateway_db -tAc "SELECT 'gateway_db.users', count(*) FROM users;" 2>/dev/null || echo 'gateway_db.users table missing'
sudo docker exec service-postgres-prod psql -U postgres -d gateway_db -tAc "SELECT 'gateway_db.audit_logs', count(*) FROM audit_logs;" 2>/dev/null || echo 'gateway_db.audit_logs missing'

echo ''
echo '=== recent users in service_db ==='
sudo docker exec service-postgres-prod psql -U postgres -d service_db -tAc "SELECT email, username, \"createdAt\" FROM users ORDER BY \"createdAt\" DESC LIMIT 5;"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=90)
print(o.read().decode())
if e.read().decode():
    print('ERR', e.read().decode())
c.close()

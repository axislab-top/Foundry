import paramiko

script = r"""
echo '=== API validate invalid ==='
sudo docker exec service-gateway-prod wget -qO- --post-data='{"email":"nobody@example.com","password":"wrongpass1"}' \
  --header='Content-Type: application/json' \
  http://api-service:3000/api/auth/validate 2>&1 | head -c 400
echo ''
echo '=== gateway logs last login ==='
sudo docker logs service-gateway-prod --tail 5 2>&1
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=60)
print(o.read().decode())
c.close()

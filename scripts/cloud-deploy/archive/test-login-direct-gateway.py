import paramiko

script = r"""
echo '=== gateway direct invalid login ==='
sudo docker exec service-gateway-prod wget -qO- --post-data='{"email":"nobody@example.com","password":"wrongpass1"}' \
  --header='Content-Type: application/json' \
  http://127.0.0.1:3002/api/auth/login 2>&1 | head -c 500
echo ''
echo '=== nginx via localhost ==='
curl -s -i -X POST http://127.0.0.1/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass1"}' | head -30
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
if e.read().decode():
    print('ERR', e.read().decode())
c.close()

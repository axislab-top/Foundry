import paramiko
import json

script = r"""
echo '=== curl gateway direct invalid login ==='
curl -s -i -X POST http://127.0.0.1:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass1"}' | head -20

echo ''
echo '=== recent login logs ==='
sudo docker logs service-gateway-prod 2>&1 | grep -E 'auth/login|Request failed|Response already sent|Unauthorized' | tail -25

echo ''
echo '=== auth controller dist login method ==='
sudo docker exec service-gateway-prod sh -c 'grep -n "login" dist/modules/auth/auth.controller.js | head -20'

echo ''
echo '=== check exception filter registration in main.js ==='
sudo docker exec service-gateway-prod sh -c 'grep -n "useGlobalFilters\|APP_FILTER" dist/main.js | head -15'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=90)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
c.close()

import paramiko

script = r"""
echo '=== Client error / Response already sent / Failed to send ==='
sudo docker logs service-gateway-prod 2>&1 | grep -E 'Client error|Response already sent|Failed to send error|HttpExceptionFilter' | tail -20

echo ''
echo '=== http exception filter dist ==='
sudo docker exec service-gateway-prod cat dist/common/exceptions/filters/http-exception.filter.js

echo ''
echo '=== exceptions module dist ==='
sudo docker exec service-gateway-prod cat dist/common/exceptions/exceptions.module.js
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=90)
print(o.read().decode())
c.close()

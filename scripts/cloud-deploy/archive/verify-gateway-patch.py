import paramiko

script = r"""
echo '=== invalid login direct ==='
curl -s -i -X POST http://127.0.0.1:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass1"}' | head -25

echo ''
echo '=== patched cb interceptor grep ==='
sudo docker exec service-gateway-prod grep -n 'recordCircuitBreakerFailure\|catchError(async' dist/common/resilience/interceptors/circuit-breaker.interceptor.js | head -10
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=60)
print(o.read().decode())
c.close()

import paramiko

script = r"""
curl -s -i -X POST http://127.0.0.1:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpass1"}' | head -25
echo '---'
curl -s -i -X POST http://127.0.0.1:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"3642602966@qq.com","password":"TestPass123!"}' | head -25
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(script, timeout=60)
print(o.read().decode())
c.close()

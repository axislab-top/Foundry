import paramiko

c = paramiko.SSHClient()
c.set_parallel_host_key_policy = None
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker exec service-gateway-prod sh -c \"grep -n 'async login' dist/modules/auth/auth.service.js; sed -n '/async login/,/async adminLogin/p' dist/modules/auth/auth.service.js | head -100\"",
    timeout=30,
)
print(o.read().decode())
c.close()

import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker logs service-gateway-prod 2>&1 | grep '/api/auth/login' | tail -40",
    timeout=60,
)
print(o.read().decode())
c.close()

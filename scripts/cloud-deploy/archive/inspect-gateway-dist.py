import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker exec service-gateway-prod sh -c 'grep -l \"login\" dist/modules/auth/auth.controller.js 2>/dev/null && sed -n \"1,120p\" dist/modules/auth/auth.controller.js 2>/dev/null | head -80'",
    timeout=30,
)
print(o.read().decode() or 'no dist found')
c.close()

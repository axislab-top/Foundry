import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker exec service-gateway-prod sh -c 'sed -n \"1,200p\" dist/common/interceptors/logging.interceptor.js'",
    timeout=30,
)
print(o.read().decode())
c.close()

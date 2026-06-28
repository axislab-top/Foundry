import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

for svc in ["service-api-prod", "service-gateway-prod"]:
    print(f"=== {svc} last 40 ===")
    _, o, _ = c.exec_command(f"sudo docker logs {svc} --tail 40 2>&1", timeout=30)
    print(o.read().decode())

c.close()

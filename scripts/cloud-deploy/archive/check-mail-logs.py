import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

queries = [
    "sudo docker logs service-api-prod 2>&1 | grep -iE 'Mail sent|Failed to send' | tail -20",
    "sudo docker logs service-gateway-prod 2>&1 | grep -i 'send-verification-code' | tail -10",
]

for q in queries:
    print(f"=== {q} ===")
    _, o, _ = c.exec_command(q, timeout=60)
    print(o.read().decode() or "(no matches)\n")

c.close()

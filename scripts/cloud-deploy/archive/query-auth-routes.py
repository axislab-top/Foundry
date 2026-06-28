import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker exec service-postgres-prod psql -U postgres -d gateway_db -c \"SELECT id, path, service, transport, enabled FROM routes WHERE path ILIKE '%auth%' OR path ILIKE '%login%';\"",
    timeout=30,
)
print(o.read().decode())
c.close()

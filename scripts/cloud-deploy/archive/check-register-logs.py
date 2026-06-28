import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

cmds = [
    "sudo docker logs service-gateway-prod 2>&1 | grep '/api/auth/register' | grep -v send-verification | tail -20",
    # login directly to gateway bypass nginx - need valid creds; first list recent users
    "sudo docker exec service-postgres-prod psql -U postgres -d service_db -tAc \"SELECT email, username, \\\"createdAt\\\" FROM users ORDER BY \\\"createdAt\\\" DESC LIMIT 5;\"",
]
for cmd in cmds:
    print('===', cmd[:80], '===')
    _, o, _ = c.exec_command(cmd, timeout=60)
    print(o.read().decode())
c.close()

import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

sql = r"""
sudo docker exec service-postgres-prod psql -U postgres -d service_db -tAc \
"SELECT email, username, enabled, \"createdAt\" FROM users WHERE email LIKE '%979737992%' OR email LIKE '%smtp-ok-test%';"
"""

_, o, _ = c.exec_command(sql, timeout=30)
print("users:", o.read().decode().strip() or "(none)")

c.close()

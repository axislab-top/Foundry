import paramiko

script = r"""
sudo docker exec service-gateway-prod sh -c 'wget -S -O- --post-data="{\"email\":\"nobody@example.com\",\"password\":\"wrongpass1\"}" --header="Content-Type: application/json" http://127.0.0.1:3002/api/auth/login 2>&1' | tail -30
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
print(e.read().decode())
c.close()

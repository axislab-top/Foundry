import paramiko

script = r"""
echo '=== /opt/foundry layout ==='
ls -la /opt/foundry 2>/dev/null | head -20
echo ''
echo '=== docker status ==='
sudo docker ps --format '{{.Names}} {{.Status}}' | head -10
echo ''
echo '=== gateway image ==='
sudo docker images foundry/gateway --format '{{.Repository}}:{{.Tag}} {{.ID}}'
echo ''
echo '=== has source apps/gateway? ==='
ls /opt/foundry/apps/gateway/package.json 2>/dev/null || echo 'no source'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err:
    print(err)
c.close()

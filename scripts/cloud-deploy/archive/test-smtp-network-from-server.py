import paramiko

checks = r"""
echo '=== DNS ==='
getent hosts smtp.qq.com || nslookup smtp.qq.com 2>/dev/null | tail -5

echo '=== TCP connect 465 ==='
timeout 5 bash -c 'echo | openssl s_client -connect smtp.qq.com:465 -brief 2>&1' | head -15

echo '=== TCP connect 587 ==='
timeout 5 bash -c 'echo | openssl s_client -connect smtp.qq.com:587 -starttls smtp -brief 2>&1' | head -15

echo '=== curl port test ==='
timeout 5 nc -zv smtp.qq.com 465 2>&1 || true
timeout 5 nc -zv smtp.qq.com 587 2>&1 || true
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(checks, timeout=90)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
c.close()

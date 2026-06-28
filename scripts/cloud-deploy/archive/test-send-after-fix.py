import json
import paramiko
import urllib.request
import ssl

body = json.dumps({"email": "smtp-ok-test-20260619@outlook.com"}).encode()
req = urllib.request.Request(
    "https://axislab.top/api/auth/register/send-verification-code",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
ctx = ssl.create_default_context()
try:
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        print("HTTP", resp.status, resp.read().decode())
except urllib.error.HTTPError as ex:
    print("HTTP_ERR", ex.code, ex.read().decode())

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker logs service-api-prod --tail 15 2>&1 | grep -iE 'Mail sent|Failed to send|SMTP'",
    timeout=30,
)
print("--- logs ---")
print(o.read().decode())
c.close()

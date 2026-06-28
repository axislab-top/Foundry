import json
import paramiko
import urllib.request
import ssl

# 1) Trigger registration email API
body = json.dumps({"email": "smtp-live-test-20260619@outlook.com"}).encode()
req = urllib.request.Request(
    "https://axislab.top/api/auth/register/send-verification-code",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
try:
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        print("HTTP", resp.status, resp.read().decode())
except Exception as ex:
    if hasattr(ex, "read"):
        print("HTTP_ERR", ex.code, ex.read().decode())
    else:
        print("HTTP_ERR", ex)

# 2) Fetch API logs
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, _ = c.exec_command(
    "sudo docker logs service-api-prod --tail 30 2>&1 | grep -iE 'SMTP|mail|registration|535|EAUTH|Failed to send'",
    timeout=30,
)
print("--- API logs ---")
print(o.read().decode())
c.close()

import paramiko

script = r"""
python3 - <<'PY'
import smtplib, ssl
try:
    s = smtplib.SMTP_SSL("smtp.qq.com", 465, context=ssl.create_default_context(), timeout=15)
    code, msg = s.ehlo()[0], "ehlo"
    s.login("461628691@qq.com", "eicydkiarngvccgd")
    print("LOGIN_OK")
    s.quit()
except Exception as e:
    print("LOGIN_FAIL:", repr(e))
PY
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
print("exit", o.channel.recv_exit_status())
c.close()

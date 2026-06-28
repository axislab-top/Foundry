import paramiko

script = r"""
python3 - <<'PY'
import smtplib, ssl

def try_login(label, factory):
    try:
        s = factory()
        s.login("461628691@qq.com", "eicydkiarngvccgd")
        print(label + ": LOGIN_OK")
        s.quit()
    except Exception as e:
        print(label + ": LOGIN_FAIL:", repr(e))

def ssl465():
    return smtplib.SMTP_SSL("smtp.qq.com", 465, context=ssl.create_default_context(), timeout=15)

def starttls587():
    s = smtplib.SMTP("smtp.qq.com", 587, timeout=15)
    s.ehlo()
    s.starttls(context=ssl.create_default_context())
    s.ehlo()
    return s

try_login("465_SSL", ssl465)
try_login("587_STARTTLS", starttls587)
PY
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=90)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
print("exit", o.channel.recv_exit_status())
c.close()

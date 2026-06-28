import paramiko

script = r"""
sudo docker exec service-api-prod node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});
t.verify().then(() => console.log('NODE_VERIFY_OK')).catch(e => console.log('NODE_VERIFY_FAIL', e && e.message));
"

echo '--- pass length ---'
sudo docker exec service-api-prod sh -c 'echo -n "$SMTP_PASS" | wc -c'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)
_, o, e = c.exec_command(script, timeout=60)
print(o.read().decode())
if e.read().decode():
    print("ERR", e.read().decode())
c.close()

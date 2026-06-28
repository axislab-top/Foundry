import json
import paramiko
import urllib.request
import ssl

# Test login response shape (wrong password -> 401; we only care about structure on success from logs)
ctx = ssl.create_default_context()

def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://axislab.top{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

print("=== wrong login ===")
print(post("/api/auth/login", {"email": "nobody@example.com", "password": "wrong"}))

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

cmds = [
    "sudo docker exec service-gateway-prod printenv | grep -E '^(JWT_|REDIS_)' | sort",
    "sudo docker logs service-gateway-prod 2>&1 | grep -iE 'login|token|JWT|register' | tail -25",
]
for cmd in cmds:
    print(f"\n=== {cmd} ===")
    _, o, _ = c.exec_command(cmd, timeout=60)
    print(o.read().decode() or "(empty)")
c.close()

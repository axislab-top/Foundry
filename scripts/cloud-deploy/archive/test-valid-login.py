import json
import urllib.request
import urllib.error
import ssl

ctx = ssl.create_default_context()

def post(body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        "https://axislab.top/api/auth/login",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

print("=== valid creds test ===")
print(post({"email": "3642602966@qq.com", "password": "TestPass123!"}))

import json
import urllib.request
import urllib.error
import ssl

ctx = ssl.create_default_context()

def post(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

for path in [
    "https://axislab.top/api/auth/login",
    "https://axislab.top/api/auth/register",
]:
    print(f"=== {path} invalid ===")
    print(post(path, {"email": "nobody@example.com", "password": "wrongpass1"}))

import os, json, time, hmac, hashlib, base64, secrets

def _b64(data): return base64.urlsafe_b64encode(data).decode().rstrip("=")
def issue_key():
    secret = os.environ.get("ZAKI_API_SECRET", "")
    if len(secret) < 32: raise ValueError("اضبط ZAKI_API_SECRET بطول 32 حرفًا على الأقل.")
    payload = {"iat": int(time.time()), "jti": secrets.token_urlsafe(18), "scope": "chat"}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return "zaki_live_" + body + "." + sig
def verify_key(token):
    secret = os.environ.get("ZAKI_API_SECRET", "")
    if len(secret) < 32 or not isinstance(token, str) or not token.startswith("zaki_live_"): return False
    try:
        body, sig = token[len("zaki_live_"):].split(".", 1)
        expected = _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected): return False
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return payload.get("scope") == "chat" and 0 <= int(time.time()) - int(payload["iat"]) <= 31536000
    except Exception: return False

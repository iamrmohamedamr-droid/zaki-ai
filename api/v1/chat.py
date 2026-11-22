from http.server import BaseHTTPRequestHandler
import json
from api.security import verify_key
from api.chat import configured_providers, ensemble_chat

class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        raw=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff"); self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Headers","Authorization, Content-Type"); self.send_header("Access-Control-Allow-Methods","POST, OPTIONS")
        self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_OPTIONS(self): self._send(204,{})
    def do_POST(self):
        auth=self.headers.get("Authorization", "")
        token=auth[7:] if auth.lower().startswith("bearer ") else self.headers.get("x-api-key", "")
        if not verify_key(token): return self._send(401,{"error":"API key غير صالح أو منتهي."})
        try:
            n=int(self.headers.get("content-length","0"))
            if n<=0 or n>1000000: return self._send(413,{"error":"حجم الطلب غير صالح."})
            body=json.loads(self.rfile.read(n) or b"{}")
            msgs=body.get("messages", [])
            if not isinstance(msgs,list) or not msgs: return self._send(400,{"error":"أرسل messages كمصفوفة."})
            clean=[]
            for m in msgs[-20:]:
                if isinstance(m,dict) and m.get("role") in ("user","assistant"):
                    content=str(m.get("content", ""))[:12000]
                    if content.strip(): clean.append({"role":m["role"],"content":content})
            if not clean or clean[-1]["role"]!="user": return self._send(400,{"error":"آخر رسالة يجب أن تكون من المستخدم."})
            providers=configured_providers()
            if not providers: return self._send(503,{"error":"لا توجد محركات مضبوطة."})
            reply,used,warnings=ensemble_chat(clean,providers)
            self._send(200,{"reply":reply,"model":"zaki-ensemble","engines_used":used,"warnings":warnings[:5]})
        except Exception: self._send(400,{"error":"تعذر معالجة الطلب."})

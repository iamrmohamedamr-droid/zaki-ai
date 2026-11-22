from http.server import BaseHTTPRequestHandler
import os, json, hmac
from api.security import issue_key

class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        raw=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        try:
            n=int(self.headers.get("content-length","0"))
            if n<=0 or n>5000: return self._send(413,{"error":"حجم الطلب غير صالح."})
            body=json.loads(self.rfile.read(n) or b"{}")
            master=os.environ.get("ZAKI_ADMIN_KEY", "")
            supplied=str(body.get("admin_key", ""))
            if len(master)<24 or not hmac.compare_digest(master, supplied): return self._send(403,{"error":"مفتاح الإدارة غير صحيح أو غير مضبوط على الخادم."})
            key=issue_key()
            self._send(201,{"api_key":key,"expires_in_days":365,"endpoint":"/api/v1/chat","warning":"احفظ المفتاح الآن؛ لن يظهر مرة أخرى."})
        except ValueError as e: self._send(503,{"error":str(e)})
        except Exception: self._send(400,{"error":"تعذر إنشاء المفتاح."})

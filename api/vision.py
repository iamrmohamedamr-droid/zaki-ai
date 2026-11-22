from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, base64

class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        raw=json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        try:
            n=int(self.headers.get("content-length","0"))
            if n <= 0 or n > 7_500_000: return self._send(413,{"error":"حجم الطلب كبير جدًا؛ الحد 7.5 ميجابايت."})
            body=json.loads(self.rfile.read(n) or b"{}")
            key=os.environ.get("MOONDREAM_API_KEY")
            if not key: return self._send(503,{"error":"خدمة تحليل الصور غير مفعلة؛ أضف MOONDREAM_API_KEY."})
            image_data=body.get("image_data"); image_url=body.get("image_url")
            if image_data:
                if not isinstance(image_data,str) or not image_data.startswith("data:image/") or ";base64," not in image_data: return self._send(400,{"error":"صيغة الصورة غير مدعومة."})
                try: base64.b64decode(image_data.split(",",1)[1], validate=True)
                except Exception: return self._send(400,{"error":"بيانات الصورة غير صالحة."})
            elif not (isinstance(image_url,str) and image_url.startswith("https://")):
                return self._send(400,{"error":"أرفق صورة صالحة أو رابط HTTPS."})
            payload={"question":str(body.get("question") or "صف الصورة بالتفصيل.")[:1000]}
            if image_url: payload["image_url"]=image_url
            else: payload["image_url"]=image_data
            req=urllib.request.Request("https://api.moondream.ai/v1/query",data=json.dumps(payload).encode(),
                headers={"Content-Type":"application/json","X-Moondream-Auth":key})
            with urllib.request.urlopen(req,timeout=50) as r: result=json.loads(r.read().decode())
            self._send(200,{"reply":result.get("answer") or result.get("result") or "لم يرجع النموذج إجابة واضحة.","provider":"Moondream"})
        except urllib.error.HTTPError as e: self._send(502,{"error":f"Moondream أعاد خطأ HTTP {e.code}. تحقق من المفتاح والحصة."})
        except Exception: self._send(502,{"error":"تعذر تحليل الصورة. تحقق من الاتصال ومفتاح Moondream."})

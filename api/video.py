from http.server import BaseHTTPRequestHandler
import json, os, base64, urllib.request, urllib.error

class handler(BaseHTTPRequestHandler):
    def _send(self,code,obj):
        raw=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        try:
            n=int(self.headers.get("content-length","0"))
            if n<=0 or n>10000: return self._send(413,{"error":"الطلب أكبر من الحد المسموح."})
            body=json.loads(self.rfile.read(n) or b"{}"); prompt=str(body.get("prompt", "")).strip()
            if not prompt or len(prompt)>1500: return self._send(400,{"error":"اكتب وصفًا للفيديو لا يتجاوز 1500 حرف."})
            token=os.environ.get("HF_TOKEN")
            if not token: return self._send(503,{"error":"توليد الفيديو غير مفعل؛ أضف HF_TOKEN. قد تتطلب الخدمة حصة مدفوعة."})
            model=os.environ.get("VIDEO_MODEL","ali-vilab/text-to-video-ms-1.7b")
            req=urllib.request.Request(f"https://api-inference.huggingface.co/models/{model}",data=json.dumps({"inputs":prompt}).encode(),
                headers={"Content-Type":"application/json","Authorization":"Bearer "+token})
            with urllib.request.urlopen(req,timeout=55) as r: video=r.read()
            self._send(200,{"video":"data:video/mp4;base64,"+base64.b64encode(video).decode()})
        except urllib.error.HTTPError as e: self._send(502,{"error":f"خدمة الفيديو أعادت HTTP {e.code}. قد يكون النموذج غير متاح أو يحتاج انتظارًا."})
        except Exception: self._send(502,{"error":"تعذر توليد الفيديو أو انتهت مهلة الخدمة."})

type Msg = { role: "user" | "assistant"; content: string };
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const DB_NAME = "zaki-ai-local", STORE = "state", STATE_KEY = "chat";
let chatHistory: Msg[] = [];
let liveOn = false;
let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (!("indexedDB" in window)) return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function saveHistory() {
  const value = chatHistory.slice(-100);
  if (db) {
    await new Promise<void>(resolve => {
      const tx = db!.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(value, STATE_KEY);
      tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
    });
  } else {
    try { localStorage.setItem("zaki-chat", JSON.stringify(value)); } catch { /* storage may be full/disabled */ }
  }
}
async function loadHistory() {
  db = await openDB();
  if (db) {
    const value = await new Promise<Msg[] | undefined>(resolve => {
      const req = db!.transaction(STORE, "readonly").objectStore(STORE).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined);
    });
    if (Array.isArray(value)) chatHistory = value;
  } else {
    try { const value = JSON.parse(localStorage.getItem("zaki-chat") || "[]"); if (Array.isArray(value)) chatHistory = value; } catch { chatHistory = []; }
  }
  chatHistory.forEach(m => add(m.role === "user" ? "u" : "a", m.content.replace(/```action[\s\S]*?```/g, "").trim()));
  updateMemoryLabel();
}
function updateMemoryLabel() { const el = $("#memoryStatus"); if (el) el.textContent = `💾 محفوظ محليًا · ${chatHistory.length} رسالة`; }

document.querySelectorAll<HTMLButtonElement>("nav button").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll("section").forEach(s => s.classList.remove("show"));
    $(`#${b.dataset.t}-s`).classList.add("show");
  };
});
function add(role: "u" | "a", text: string) {
  const d = document.createElement("div"); d.className = `m ${role}`; d.textContent = text;
  $("#chat").appendChild(d); $("#chat").scrollTop = 1e9;
}
async function send(text: string) {
  if (!text.trim()) return;
  add("u", text); chatHistory.push({ role: "user", content: text }); await saveHistory(); updateMemoryLabel();
  const sendButton = $<HTMLButtonElement>("#send"); sendButton.disabled = true; sendButton.textContent = "جاري التفكير…";
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory.slice(-20), provider: $<HTMLSelectElement>("#provider").value }) });
    const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    const reply: string = d.reply; chatHistory.push({ role: "assistant", content: reply }); await saveHistory(); updateMemoryLabel();
    add("a", `${reply.replace(/```action[\s\S]*?```/g, "").trim()}\n\n— ${d.provider || "Zaki Core"}`);
    if (liveOn) speak(reply.replace(/```[\s\S]*?```/g, "")); await runActions(reply);
  } catch (e) { add("a", "⚠️ حصل خطأ: " + (e as Error).message); }
  finally { sendButton.disabled = false; sendButton.textContent = "إرسال"; }
}
$("#send").onclick = () => { const i = $<HTMLInputElement>("#msg"); const value = i.value; i.value = ""; void send(value); };
$("#msg").addEventListener("keydown", e => { if ((e as KeyboardEvent).key === "Enter") $("#send").click(); });

const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let rec: any;
function speak(t: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "ar-EG";
  u.onend = () => { if (liveOn) setTimeout(() => { try { rec?.start(); } catch { /* already active */ } }, 250); };
  speechSynthesis.speak(u);
}
$("#live").onclick = () => {
  if (!SR) return alert("المتصفح ده مش بيدعم التعرف على الصوت. جرّب Chrome.");
  liveOn = !liveOn; $("#live").classList.toggle("on", liveOn);
  if (!liveOn) { rec?.abort(); speechSynthesis.cancel(); $("#live").textContent = "🎙️ محادثة صوتية"; return; }
  $("#live").textContent = "⏹ إيقاف الصوت"; rec = new SR(); rec.lang = "ar-EG"; rec.interimResults = false; rec.continuous = false;
  rec.onresult = (e: any) => void send(e.results[0][0].transcript);
  rec.onerror = () => { if (liveOn) { liveOn = false; $("#live").classList.remove("on"); $("#live").textContent = "🎙️ محادثة صوتية"; } };
  try { rec.start(); } catch { /* recognition is already starting */ }
};

async function runActions(reply: string) {
  const m = reply.match(/```action\s*([\s\S]*?)```/); if (!m) return;
  let a: any; try { a = JSON.parse(m[1]); } catch { return; }
  if (!confirm(`زكي عايز ينفّذ: ${a.type}\nتوافق؟`)) return;
  switch (a.type) {
    case "notify": if ("Notification" in window && await Notification.requestPermission() === "granted") new Notification("زكي", { body: String(a.text || "") }); break;
    case "open_url": if (typeof a.url === "string" && /^https?:\/\//i.test(a.url)) window.open(a.url, "_blank", "noopener,noreferrer"); break;
    case "copy": await navigator.clipboard.writeText(String(a.text ?? "")); break;
    case "location": navigator.geolocation.getCurrentPosition(p => add("a", `📍 ${p.coords.latitude}, ${p.coords.longitude}`), () => add("a", "تعذر الوصول للموقع.")); break;
    case "timer": setTimeout(() => alert("⏰ الوقت خلص!"), Math.min(Math.max(Number(a.seconds) || 60, 1), 86400) * 1000); break;
  }
}

$("#clearChat").onclick = async () => {
  if (!confirm("مسح سجل المحادثة المحفوظ على هذا الجهاز؟")) return;
  chatHistory = []; $("#chat").replaceChildren(); await saveHistory(); updateMemoryLabel();
};
$("#exportChat").onclick = () => {
  const blob = new Blob([chatHistory.map(m => `${m.role === "user" ? "أنت" : "زكي"}:\n${m.content}`).join("\n\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "zaki-chat.txt"; a.click(); URL.revokeObjectURL(url);
};

$("#ig").onclick = () => {
  const p = $<HTMLInputElement>("#ip").value.trim(); if (!p) return;
  $<HTMLImageElement>("#iout").src = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
};
const cv = $<HTMLCanvasElement>("#cv"), ctx = cv.getContext("2d")!; let src: HTMLImageElement | null = null;
function draw() { if (!src) return; cv.width = src.naturalWidth; cv.height = src.naturalHeight; ctx.filter = $<HTMLSelectElement>("#flt").value; ctx.drawImage(src, 0, 0); ctx.filter = "none"; }
$<HTMLInputElement>("#ifile").onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; src = new Image(); src.onload = draw; src.src = URL.createObjectURL(f); };
$("#flt").onchange = draw;
$("#idl").onclick = () => { if (!cv.width) return alert("اختَر صورة أولاً."); const a = document.createElement("a"); a.download = "zaki.png"; a.href = cv.toDataURL(); a.click(); };

$("#vg").onclick = async () => {
  const p = $<HTMLInputElement>("#vp").value.trim(); if (!p) return;
  $("#vs").textContent = "⏳ جاري الطلب… توفر الفيديو يعتمد على النموذج والحصة وحدود الاستضافة.";
  try { const r = await fetch("/api/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: p }) });
    const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    $<HTMLVideoElement>("#vout").src = d.video; $("#vs").textContent = "تم إنشاء الفيديو.";
  } catch (e) { $("#vs").textContent = "⚠️ " + (e as Error).message; }
};

$("#cam").onclick = async () => { try { const v = $<HTMLVideoElement>("#cvid"); v.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); v.style.display = "block"; } catch { $("#dout").textContent = "تعذر تشغيل الكاميرا. تحقق من الإذن واستخدم HTTPS."; } };
$("#loc").onclick = () => navigator.geolocation.getCurrentPosition(p => $("#dout").textContent = `${p.coords.latitude}, ${p.coords.longitude}`, () => $("#dout").textContent = "تعذر تحديد الموقع.");
$("#fs").onclick = async () => {
  try { const [h] = await (window as any).showOpenFilePicker(); const text = await (await h.getFile()).text();
    $("#dout").textContent = text.slice(0, 3000); chatHistory.push({ role: "user", content: "محتوى ملف محلي:\n" + text.slice(0, 6000) }); await saveHistory(); updateMemoryLabel();
  } catch { /* user cancelled or browser does not support file picker */ }
};

$("#analyzeImage").onclick = async () => {
  const file = $<HTMLInputElement>("#visionFile").files?.[0]; if (!file) return alert("اختَر صورة أولاً.");
  if (file.size > 5 * 1024 * 1024) return alert("حجم الصورة يجب ألا يتجاوز 5 ميجابايت.");
  $("#visionStatus").textContent = "⏳ جاري تحليل الصورة…"; $("#visionAnswer").textContent = "";
  try {
    const imageData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("تعذر قراءة الصورة.")); reader.readAsDataURL(file); });
    const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: imageData, question: $<HTMLInputElement>("#visionQuestion").value.trim() || "صف الصورة بالتفصيل." }) });
    const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    $("#visionAnswer").textContent = d.reply; $("#visionStatus").textContent = `تم التحليل بواسطة ${d.provider || "Moondream"}.`;
  } catch (e) { $("#visionStatus").textContent = "⚠️ " + (e as Error).message; }
};

void loadHistory();
fetch("/api/chat").then(r => r.json()).then(d => { const el = $("#apiStatus"); el.textContent = `الخادم: متصل · المحركات المضبوطة: ${(d.providers || []).join("، ") || "لا يوجد"}`; }).catch(() => { $("#apiStatus").textContent = "الخادم غير متاح بعد؛ شغّل المشروع عبر Vercel أو بيئة تدعم Python Functions."; });

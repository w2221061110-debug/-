const V = 'shici-v4';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.png', 'data/dict.txt', 'js/app.js', 'js/store.js', 'js/parse.js', 'js/dict.js', 'js/speak.js', 'js/srs.js', 'js/sync.js', 'js/ocr.js', 'vendor/tesseract.min.js', 'vendor/worker.min.js', 'vendor/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract-core-lstm.wasm.js', 'vendor/eng.traineddata.gz', 'vendor/qrcode.min.js', 'vendor/jsQR.min.js'];
// 必需文件一次性预缓存；体积大的 OCR 引擎/模型（约 11MB）尽力缓存，失败不影响安装（国内网络抖动时不至于整个离线功能失效）
const CORE = SHELL.filter(f => !/tesseract|worker\.min|traineddata/.test(f)), BIG = SHELL.filter(f => !CORE.includes(f));
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(CORE).then(() => { BIG.forEach(f => c.add(f).catch(() => {})); })).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('shici-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET') return;
  if (u.origin === location.origin && u.href.startsWith(self.registration.scope)) { // 先网络后缓存（保证更新），离线用缓存
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); e.waitUntil(caches.open(V).then(c => c.put(e.request, cp)).catch(() => {})); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (/cdn\.jsdelivr\.net|fastly\.jsdelivr\.net/.test(u.host)) { // 库文件缓存优先
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); e.waitUntil(caches.open(V).then(c => c.put(e.request, cp)).catch(() => {})); } return r; })));
  }
});

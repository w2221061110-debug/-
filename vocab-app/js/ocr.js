// 拍照 -> 预处理 -> tesseract.js
let workerP = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
export async function getWorker(onProgress) {
  if (!workerP) workerP = (async () => {
    // 优先用同站点自带的引擎和模型（GitHub Pages，国内可直连），失败再用 jsDelivr
    const local = new URL('../vendor/', import.meta.url).href;
    const srcs = [
      { lib: local + 'tesseract.min.js', workerPath: local + 'worker.min.js', corePath: local, langPath: local },
      { lib: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/', langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/' },
    ];
    let w, err;
    for (const s of srcs) {
      try {
        if (!window.Tesseract) await loadScript(s.lib);
        w = await Tesseract.createWorker('eng', 1, { workerPath: s.workerPath, corePath: s.corePath, langPath: s.langPath, logger: m => onProgress?.(m), errorHandler: () => {} });
        break;
      } catch (e) { err = e; }
    }
    if (!w) throw err;
    await w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
    return w;
  })().catch(e => { workerP = null; throw e; });
  return workerP;
}
export async function fileToCanvas(file, maxSide = 2200) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const up = Math.max(bmp.width, bmp.height) < 1000 ? 1.8 : 1;   // 小图放大
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc * up); c.height = Math.round(bmp.height * sc * up);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.(); return c;
}
export function preprocess(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data, n = c.width * c.height;
  const gray = new Uint8ClampedArray(n); const hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) { const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; gray[i] = v; hist[v]++; }
  // 自适应阈值（积分图，窗口 ~1/16 宽），对阴影/光照不均的手机照片更稳
  const W = c.width, H = c.height, S = Math.max(15, (W / 16) | 0), half = S >> 1;
  const integ = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += gray[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row; } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - half), x1 = Math.min(W, x + half), y0 = Math.max(0, y - half), y1 = Math.min(H, y + half);
    const sum = integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
    const mean = sum / ((x1 - x0) * (y1 - y0)); const v = gray[y * W + x] < mean * 0.86 ? 0 : 255; const i = (y * W + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
export function thumb(src, side = 240) {
  const sc = side / Math.max(src.width, src.height); const c = document.createElement('canvas');
  c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
export async function recognize(file, onProgress) {
  const canvas = await fileToCanvas(file);
  onProgress?.({ status: '图片预处理', progress: 0.05 });
  const pre = preprocess(canvas);
  const w = await getWorker(onProgress);
  const { data } = await w.recognize(pre);
  // 置信度过低的行丢弃
  // 按词重建行：大间隔切段，丢掉平均置信度低的段（例如英文模型认不出的中文释义）
  const lines = [];
  for (const l of data.lines || []) {
    const ws = (l.words || []).filter(w => w.text.trim()); if (!ws.length) continue;
    const h = Math.max(8, l.bbox.y1 - l.bbox.y0); let seg = [ws[0]]; const segs = [seg];
    for (let k = 1; k < ws.length; k++) { if (ws[k].bbox.x0 - ws[k - 1].bbox.x1 > h * 1.6) segs.push(seg = []); seg.push(ws[k]); }
    const keep = segs.filter(sg => sg.reduce((a, w) => a + w.confidence, 0) / sg.length >= 62 && /[A-Za-z]{2}/.test(sg.map(w => w.text).join('')));
    // 英文模型把中文释义认成的短尾巴（如 "tax revenue Big"）：隔开一大段距离、只有一个大写开头短词的段 → 去掉
    for (let k = keep.length - 1; k > 0; k--) if (keep[k].length === 1 && /^[A-Z][A-Za-z]{0,3}$/.test(keep[k][0].text)) keep.splice(k, 1);
    if (keep.length) lines.push(keep.map(sg => sg.map(w => w.text).join(' ')).join(' ').trim());
  }
  return { text: lines.length ? lines.join('\n') : data.text, thumb: thumb(canvas), confidence: data.confidence };
}

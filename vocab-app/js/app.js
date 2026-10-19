import * as store from './store.js';
import { mem, getKV, setKV } from './store.js';
import { parseText } from './parse.js';
import { translate, loadDict, lookupLocal, shortCn } from './dict.js';
import { speak, stop, englishVoices } from './speak.js';
import { review, isDue, isNew, preview, fmtDur, newSrs } from './srs.js';
import * as sync from './sync.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const ICON = {
  spk: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="w" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
window.__toast = toast;
window.addEventListener('vocab-speech-error', () => toast('发音未能播放，请点播放按钮重试，或在设置中切换系统语音。'));
$('#toast').setAttribute('role', 'status');

// ---------- 主题 ----------
function applyTheme() { const t = getKV('theme', 'auto'); const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- 数据 ----------
const items = () => [...mem.items.values()];
const pagesSorted = () => [...mem.pages.values()].sort((a, b) => b.created - a.created);
function dueList(now = Date.now()) { return items().filter(i => isDue(i.srs, now)).sort((a, b) => a.srs.due - b.srs.due); }
function newList() { return items().filter(i => isNew(i.srs)).sort((a, b) => a.created - b.created); }
function newToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return items().filter(i => i.srs && i.srs.firstAt >= d.getTime()).length; }
function queueCount() { return dueList().length + Math.min(newList().length, Math.max(0, getKV('newPerDay', 20) - newToday())); }
function updateBadge() { const n = queueCount(); const b = $('#badge'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n; try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {} }
function level(i) { const s = i.srs; if (!s || !s.reps) return 0; return s.interval >= 21 ? 3 : s.interval >= 4 ? 2 : 1; }

async function saveUnits(units, pageId) {
  const now = Date.now(); let n = 0;
  for (const [k, u] of units.entries()) {
    const id = u.text.toLowerCase();
    const cur = mem.items.get(id);
    if (cur) { if (!cur.pages?.includes(pageId)) { cur.pages = [...(cur.pages || []), pageId]; cur.updated = now; await store.put('items', cur); } continue; }
    await store.put('items', { id, text: u.text, num: u.num || null, cn: '', phon: '', page: pageId, pages: [pageId], created: now + k, updated: now, srs: null });
    n++;
  }
  fillTranslations(units.map(u => u.text.toLowerCase()));
  return n;
}
async function fillTranslations(ids) {
  await loadDict();
  for (const id of ids) {
    const it = mem.items.get(id); if (!it || (it.cn && !it.weak)) continue;
    const r = await translate(it.text);
    Object.assign(it, { cn: r.cn, phon: r.phon || '', weak: !!r.weak, src: r.source, updated: Date.now() });
    await store.put('items', it);
    document.querySelectorAll(`[data-cn="${CSS.escape(id)}"]`).forEach(el => el.textContent = shortCn(r.cn));
  }
}

// ---------- 路由 ----------
let route = { name: 'home' };
function go(name, arg, push = true) {
  stop(); route = { name, arg };
  if (push) history.pushState(route, '');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ({ page: 'home', paste: 'home', import: 'home' }[name] || name)));
  $('#back').hidden = !['page', 'paste', 'import'].includes(name);
  $('#topR').innerHTML = '';
  (VIEWS[name] || VIEWS.home)(arg);
  window.scrollTo(0, 0); updateBadge();
}
addEventListener('popstate', e => go(e.state?.name || 'home', e.state?.arg, false));
$('#back').onclick = () => history.length > 1 ? history.back() : go('home');
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); };
function setTitle(t) { $('#title').textContent = t; }

const VIEWS = {};
// ---------- 首页 ----------
VIEWS.home = () => {
  setTitle('拾词');
  const ps = pagesSorted(); const q = queueCount(); const total = mem.items.size;
  view.innerHTML = `
  <section class="hero">
    <div class="intro"><h2>拍一下书页，<br>单词就会读给你听</h2><p>编号的短语整条朗读 · 自动存进生词本 · 按遗忘曲线复习</p></div>
    <button class="big" id="bCam"><span class="ic">${ICON.cam}</span><span><b>拍照导入</b><small>对准有英语单词的那一页</small></span></button>
    <div class="row2"><button class="ghost" id="bImg">🖼️ 相册图片</button><button class="ghost" id="bPaste">📋 粘贴文字</button></div>
  </section>
  <div class="sec">今天</div>
  <button class="card today" id="bToday" style="width:100%;text-align:left">
    <div class="n">${q}</div><div class="t"><b>${q ? '个词等你复习' : total ? '今天的复习做完啦' : '还没有单词'}</b><small style="color:var(--sub)">生词本共 ${total} 个 · 已掌握 ${items().filter(i => level(i) === 3).length} 个</small></div>
    ${q ? '<span class="btn pri sm">开始</span>' : ''}
  </button>
  <div class="sec">最近导入${ps.length ? `<small>${ps.length} 页</small>` : ''}</div>
  ${ps.length ? `<div class="pages">${ps.slice(0, 12).map(pageCard).join('')}</div>` : `<div class="empty"><div class="e">📷</div>拍一页课本或单词表试试<br><button class="btn sm" id="bDemo" style="margin-top:14px">先用示例体验</button></div>`}`;
  $('#bCam').onclick = () => $('#fileCam').click();
  $('#bImg').onclick = () => $('#fileImg').click();
  $('#bPaste').onclick = () => go('paste');
  $('#bToday').onclick = () => go('review');
  $('#bDemo') && ($('#bDemo').onclick = () => importText('1. government leakage 政府漏损\n2. government profit 政府利润\n3. public expenditure 公共支出\n4. tax revenue 税收\n5. fiscal deficit 财政赤字\n6. economic growth', '示例：经济词组'));
  view.querySelectorAll('.pg').forEach(b => b.onclick = () => go('page', b.dataset.id));
};
function pageCard(p) {
  const n = items().filter(i => i.pages?.includes(p.id)).length;
  return `<button class="pg" data-id="${esc(p.id)}"><div class="im" style="${/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.thumb || '') ? `background-image:url(${esc(p.thumb)})` : ''}">${p.thumb ? '' : 'Aa'}</div><div class="meta"><b>${esc(p.title)}</b><small>${n} 条 · ${new Date(p.created).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</small></div></button>`;
}

// ---------- 导入 ----------
for (const id of ['fileCam', 'fileImg']) $('#' + id).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importImage(f); };
async function importImage(file) {
  go('import');
  setTitle('识别中…');
  view.innerHTML = `<div class="card" style="margin-top:20px"><b id="ost">准备识别引擎…</b><p class="hint" id="ohint">第一次使用需要下载约 7MB 的识别引擎和模型，之后就很快了。</p><div class="progress"><i id="obar"></i></div></div>`;
  const { recognize } = await import('./ocr.js');
  const map = { 'loading tesseract core': '下载识别引擎', 'initializing tesseract': '启动识别引擎', 'loading language traineddata': '下载英文模型', 'initializing api': '准备中', 'recognizing text': '正在识别文字' };
  try {
    const r = await recognize(file, m => { if (route.name !== 'import') return; $('#ost').textContent = (map[m.status] || m.status) + '…'; $('#obar').style.width = Math.round((m.progress || 0) * 100) + '%'; });
    if (route.name !== 'import') return;
    const parsed = parseText(r.text);
    if (!parsed.units.length) { view.innerHTML = `<div class="empty"><div class="e">🤔</div>没认出英文。换个角度、光线亮一点再拍一次？<br><br><button class="btn" id="re">重新拍</button> <button class="btn" id="pt">改成粘贴文字</button></div>`; $('#re').onclick = () => $('#fileCam').click(); $('#pt').onclick = () => go('paste', r.text); return; }
    await createPage(parsed, r.text, r.thumb, null, true);
  } catch (e) {
    console.warn(e);
    view.innerHTML = `<div class="empty"><div class="e">📶</div>识别引擎下载失败，请检查网络后重试。<br><small>${esc(e.message)}</small><br><br><button class="btn" id="pt">改成粘贴文字</button></div>`; $('#pt').onclick = () => go('paste');
  }
}
async function createPage(parsed, raw, thumb, title, replace) {
  const id = 'p' + Date.now().toString(36);
  const t = title || (parsed.units.slice(0, 2).map(u => u.text).join(' · ') + (parsed.units.length > 2 ? ' …' : ''));
  const saveList = parsed.mode === 'list' ? parsed.units : [];
  await store.put('pages', { id, title: t.slice(0, 40), created: Date.now(), thumb: thumb || '', raw, mode: parsed.mode, text: parsed.text || '', units: parsed.units.map(u => ({ text: u.text, num: u.num || null })) });
  const n = await saveUnits(saveList, id);
  if (replace) history.replaceState({ name: 'page', arg: id }, ''); 
  go('page', id, !replace);
  toast(parsed.mode === 'list' ? `已导入 ${parsed.units.length} 条，自动存进生词本` : '已导入文章：点单词查看，长按拖动可选短语');
  return n;
}
function importText(text, title) { const parsed = parseText(text); if (!parsed.units.length) return toast('没有找到英文'); return createPage(parsed, text, '', title, false); }
VIEWS.import = () => {};
VIEWS.paste = (pre) => {
  setTitle('粘贴文字');
  view.innerHTML = `<p class="hint">把单词表或文章粘进来。每行一个、或者带 1. 2. 编号的，会按整条朗读；整段文章则可以逐词点读。</p>
  <textarea class="paste" id="ta" placeholder="1. government leakage\n2. government profit\n…">${esc(pre || '')}</textarea>
  <div style="display:flex;gap:10px;margin-top:12px"><button class="btn" id="pc">从剪贴板粘贴</button><span style="flex:1"></span><button class="btn pri" id="go">导入</button></div>`;
  $('#pc').onclick = async () => { try { $('#ta').value = await navigator.clipboard.readText(); } catch { toast('请长按输入框选择「粘贴」'); } };
  $('#go').onclick = () => importText($('#ta').value);
};

// ---------- 页面 ----------
let playAllToken = 0;
VIEWS.page = (id) => {
  const p = mem.pages.get(id); if (!p) return go('home');
  setTitle(p.title);
  $('#topR').innerHTML = `<button class="btn sm" id="delp" aria-label="删除这页">删除</button>`;
  $('#delp').onclick = async () => { if (!confirm('删除这一页？（生词本里的单词会保留）')) return; await store.del('pages', id); history.back(); };
  const head = `<div class="pagehead">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}<div><b>${p.mode === 'list' ? p.units.length + ' 条' : '文章'}</b><div class="hint" style="margin:2px 0">${new Date(p.created).toLocaleString('zh-CN')}</div></div></div>`;
  if (p.mode === 'list') {
    view.innerHTML = head + `<div class="toolbar"><button class="btn pri" id="pall">▶ 全部朗读</button><button class="btn" id="hcn">${getKV('hideCn') ? '显示中文' : '遮住中文'}</button><button class="btn" id="edit">修改文字</button></div>
    <div class="units ${getKV('hideCn') ? 'hidecn' : ''}" id="units">${p.units.map((u, k) => { const it = mem.items.get(u.text.toLowerCase()); return `<button class="unit" data-k="${k}"><span class="num">${esc(u.num || k + 1)}</span><span class="body"><div class="en">${esc(u.text)}</div><div class="cn" data-cn="${esc(u.text.toLowerCase())}">${esc(shortCn(it?.cn) || '…')}</div></span><span class="spk">${ICON.spk}</span></button>`; }).join('')}</div>
    <p class="hint">点一下就读整条；再点一次看详细释义。</p>`;
    const els = [...view.querySelectorAll('.unit')];
    const play = async (k) => { els.forEach(e => e.classList.remove('playing')); els[k].classList.add('playing'); await speak(p.units[k].text); els[k]?.classList.remove('playing'); };
    els.forEach(el => el.onclick = () => { const k = +el.dataset.k; playAllToken++; if (el.classList.contains('open')) openWord(p.units[k].text, p.units[k]); el.classList.add('open'); play(k); });
    $('#pall').onclick = async () => { const tok = ++playAllToken; for (let k = 0; k < els.length && tok === playAllToken && route.arg === id; k++) { els[k].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); await play(k); await new Promise(r => setTimeout(r, 450)); } };
    $('#hcn').onclick = () => { setKV('hideCn', !getKV('hideCn')); go('page', id, false); };
    $('#edit').onclick = () => editPage(p);
    fillTranslations(p.units.map(u => u.text.toLowerCase()));
  } else {
    const flow = p.text.replace(/([^.!?:\n])\n(?=[a-z(])/g, '$1 ').replace(/,\n/g, ', ');
    const parts = flow.split(/([A-Za-z]+(?:['’\-][A-Za-z]+)*)/);
    let wi = 0;
    view.innerHTML = head + `<div class="card prose" id="prose">${parts.map((s, k) => k % 2 ? `<span class="w${mem.items.has(s.toLowerCase()) ? ' saved' : ''}" data-i="${wi++}">${esc(s)}</span>` : esc(s).replace(/\n/g, '<br>')).join('')}</div>
    <p class="hint">👆 点单词：发音+释义　✋ 按住不放再拖动：选中短语整体朗读</p>`;
    proseSelect($('#prose'));
  }
};
function editPage(p) {
  openSheet(`<div class="grab"></div><b>修改识别结果</b><p class="hint">识别有错可以直接改，每行一条。</p><textarea class="paste" id="et">${esc(p.mode === 'list' ? p.units.map((u, k) => `${u.num || k + 1}. ${u.text}`).join('\n') : p.text)}</textarea><div class="playrow"><button class="btn" id="ec">取消</button><button class="btn pri" id="es">保存</button></div>`);
  $('#ec').onclick = closeSheet;
  $('#es').onclick = async () => { const parsed = parseText($('#et').value); Object.assign(p, { mode: parsed.mode, text: parsed.text || '', units: parsed.units.map(u => ({ text: u.text, num: u.num || null })), updated: Date.now() }); await store.put('pages', p); if (parsed.mode === 'list') await saveUnits(parsed.units, p.id); closeSheet(); go('page', p.id, false); };
}
function proseSelect(root) {
  const ws = [...root.querySelectorAll('.w')]; let timer, start = -1, end = -1, selecting = false, moved = false, sx = 0, sy = 0;
  const mark = () => { const [a, b] = [Math.min(start, end), Math.max(start, end)]; ws.forEach((w, i) => w.classList.toggle('sel', i >= a && i <= b)); };
  const clear = () => ws.forEach(w => w.classList.remove('sel'));
  root.addEventListener('pointerdown', e => {
    const w = e.target.closest('.w'); if (!w || !e.isPrimary) return; root.setPointerCapture(e.pointerId); start = end = +w.dataset.i; moved = false; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { selecting = true; mark(); navigator.vibrate?.(10); }, 380);
  });
  root.addEventListener('pointermove', e => {
    if (!selecting) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(timer); moved = true; } return; }
    e.preventDefault(); const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.w'); if (el && root.contains(el)) { end = +el.dataset.i; mark(); }
  });
  root.addEventListener('contextmenu', e => e.preventDefault());
  root.addEventListener('touchmove', e => { if (selecting) e.preventDefault(); }, { passive: false });
  const up = () => {
    clearTimeout(timer); if (start < 0) return;
    if (selecting) { const [a, b] = [Math.min(start, end), Math.max(start, end)]; const phrase = ws.slice(a, b + 1).map(w => w.textContent).join(' '); selecting = false; speak(phrase); openWord(phrase); setTimeout(clear, 600); }
    else if (!moved) { const t = ws[start].textContent; ws[start].classList.add('sel'); speak(t); openWord(t); setTimeout(clear, 400); }
    start = -1;
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', () => { clearTimeout(timer); selecting = false; start = -1; clear(); });
}

// ---------- 单词详情 ----------
async function openWord(text, unit) {
  const id = text.toLowerCase(); let it = mem.items.get(id);
  openSheet(`<div class="grab"></div><div class="word-big">${esc(text)}</div><div class="phon" id="wph">${it?.phon ? '/' + esc(it.phon) + '/' : ''}</div>
    <div class="playrow"><button class="btn pri" id="wp">${ICON.spk} 发音</button><button class="btn" id="ws">🐢 慢速</button></div>
    <div class="cn-big" id="wcn">${esc(it?.cn || '查询中…')}</div><div class="src" id="wsrc"></div>
    <div class="playrow"><button class="btn ${it ? 'danger' : ''}" id="wsave">${it ? '从生词本移除' : '＋ 加入生词本'}</button><button class="btn" id="wclose">关闭</button></div>`);
  $('#wp').onclick = () => speak(text); $('#ws').onclick = () => speak(text, { slow: true }); $('#wclose').onclick = closeSheet;
  const rp = translate(text);
  $('#wsave').onclick = async () => { const r = await rp; return saveToggle(r); };
  const r = await rp;
  if (!$('#wcn')) return;
  $('#wcn').textContent = r.cn; $('#wph').textContent = r.phon ? `/${r.phon}/` : ''; $('#wsrc').textContent = (r.source ? '来源：' + r.source : '') + (r.base && r.base !== id ? ` · 原形 ${r.base}` : '');
  async function saveToggle(r) {
    it = mem.items.get(id);
    if (it) { await store.del('items', id); toast('已移除'); }
    else { const pid = route.name === 'page' ? route.arg : ''; await store.put('items', { id, text, cn: r.cn, phon: r.phon || '', page: pid, pages: pid ? [pid] : [], created: Date.now(), updated: Date.now(), srs: null }); toast('已加入生词本'); }
    closeSheet(); updateBadge(); document.querySelectorAll('.prose .w').forEach(w => w.classList.toggle('saved', mem.items.has(w.textContent.toLowerCase())));
    if (route.name === 'book') go('book', null, false);
  };
}
let sheetAt = 0;
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheetWrap').hidden = false; sheetAt = Date.now(); }
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }
// 触屏点按后浏览器会再补发一次 click，落在刚弹出的遮罩上；500ms 内忽略，避免弹层一闪就关
$('#sheetWrap').onclick = e => { if (e.target.id === 'sheetWrap' && Date.now() - sheetAt > 500) closeSheet(); };
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// ---------- 生词本 ----------
let bookFilter = 'all', bookQ = '';
VIEWS.book = () => {
  setTitle('生词本');
  const all = items();
  view.innerHTML = `<input class="search" id="q" type="search" placeholder="🔍 搜索英文或中文" value="${esc(bookQ)}">
  <div class="chips">${[['all', '全部', all.length], ['due', '待复习', dueList().length], ['new', '新词', newList().length], ['learn', '学习中', all.filter(i => level(i) && level(i) < 3).length], ['done', '已掌握', all.filter(i => level(i) === 3).length]].map(([k, l, n]) => `<button class="chip ${bookFilter === k ? 'on' : ''}" data-f="${k}">${l} ${n}</button>`).join('')}</div><div id="bl"></div>`;
  $('#q').oninput = e => { bookQ = e.target.value; renderBook(); };
  view.querySelectorAll('.chip').forEach(c => c.onclick = () => { bookFilter = c.dataset.f; go('book', null, false); });
  renderBook();
};
function renderBook() {
  const q = bookQ.trim().toLowerCase(); const now = Date.now();
  const f = { all: () => true, due: i => isDue(i.srs, now), new: i => isNew(i.srs), learn: i => level(i) && level(i) < 3, done: i => level(i) === 3 }[bookFilter];
  const list = items().filter(f).filter(i => !q || i.id.includes(q) || (i.cn || '').includes(q));
  if (!list.length) { $('#bl').innerHTML = `<div class="empty"><div class="e">📖</div>${mem.items.size ? '没有符合的单词' : '导入的单词会自动出现在这里'}</div>`; return; }
  const groups = new Map();
  for (const i of list.sort((a, b) => a.created - b.created)) { const g = i.page || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); }
  $('#bl').innerHTML = [...groups].sort((a, b) => (mem.pages.get(b[0])?.created || 0) - (mem.pages.get(a[0])?.created || 0)).map(([g, arr]) => { const p = mem.pages.get(g); return `<div class="group"><div class="ghead">${p?.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}<b>${esc(p?.title || '单独添加')}</b><small>${arr.length}</small>${p ? `<button class="btn sm" data-pg="${esc(g)}">打开</button>` : ''}</div><div class="wl">${arr.map(i => `<button class="wi" data-id="${esc(i.id)}"><i class="lvl l${level(i)}"></i><span class="body"><div class="en">${esc(i.text)}</div><div class="cn" data-cn="${esc(i.id)}">${esc(shortCn(i.cn))}</div></span><span class="spk icon" style="color:var(--acc)">${ICON.spk}</span></button>`).join('')}</div></div>`; }).join('');
  $('#bl').querySelectorAll('.wi').forEach(b => b.onclick = () => { const it = mem.items.get(b.dataset.id); speak(it.text); openWord(it.text); });
  $('#bl').querySelectorAll('[data-pg]').forEach(b => b.onclick = () => go('page', b.dataset.pg));
}

// ---------- 复习 ----------
const MODES = { en: ['英 → 中', '看英文，想中文'], cn: ['中 → 英', '看中文，想英文'], listen: ['听音选义', '听发音，四选一'], spell: ['听写', '听发音，拼出来'] };
VIEWS.review = () => {
  setTitle('复习');
  const due = dueList().length, nw = Math.min(newList().length, Math.max(0, getKV('newPerDay', 20) - newToday()));
  const mode = getKV('mode', 'en');
  view.innerHTML = `<div class="card stats"><div><b>${due}</b><small>到期复习</small></div><div><b>${nw}</b><small>今日新词</small></div><div><b>${items().filter(i => level(i) === 3).length}</b><small>已掌握</small></div></div>
  <div class="sec">练习方式</div><div class="modes">${Object.entries(MODES).map(([k, [a, b]]) => `<button class="mode ${k === mode ? 'on' : ''}" data-m="${k}"><b>${a}</b><small>${b}</small></button>`).join('')}</div>
  <div style="display:grid;gap:10px;margin-top:20px"><button class="btn pri" id="start" style="min-height:58px;font-size:18px" ${due + nw ? '' : 'disabled'}>${due + nw ? `开始复习 ${due + nw} 个` : '今天没有要复习的 🎉'}</button>
  ${mem.items.size >= 1 ? `<button class="btn" id="extra">自由练习（随机 20 个）</button>` : ''}</div>
  <p class="hint">按艾宾浩斯遗忘曲线（SM-2 算法）安排：记得越牢，下次间隔越长；忘了的 10 分钟后再出现。</p>`;
  view.querySelectorAll('.mode').forEach(b => b.onclick = () => { setKV('mode', b.dataset.m); go('review', null, false); });
  $('#start').onclick = () => startSession([...dueList(), ...newList().slice(0, nw)], true);
  $('#extra') && ($('#extra').onclick = () => startSession(items().sort(() => Math.random() - .5).slice(0, 20), false));
};
VIEWS.session = () => {};
let sess;
function startSession(list, graded) {
  if (!list.length) return toast('没有单词');
  sess = { list: list.map(i => i.id), i: 0, graded, right: 0, mode: getKV('mode', 'en') };
  route = { name: 'session' }; history.pushState(route, ''); $('#back').hidden = false; setTitle(MODES[sess.mode][0]);
  showCard();
}
function distractors(it, n = 3) {
  const pool = items().filter(x => x.id !== it.id && x.cn && !x.weak).sort(() => Math.random() - .5).slice(0, n);
  return pool.length >= n ? pool : [...pool, ...['n. 苹果', 'v. 跑步', 'adj. 美丽的', 'n. 天气'].slice(0, n - pool.length).map(cn => ({ cn }))];
}
function showCard() {
  if (sess.i >= sess.list.length) return finish();
  const it = mem.items.get(sess.list[sess.i]); if (!it) { sess.i++; return showCard(); }
  const m = sess.mode; const pct = sess.i / sess.list.length * 100;
  const top = `<div class="fc-top"><div class="progress"><i style="width:${pct}%"></i></div><small>${sess.i + 1}/${sess.list.length}</small></div>`;
  const ans = `<div class="ans">${m === 'en' ? '' : `<div class="q" style="font-size:30px">${esc(it.text)}</div>`}<div class="phon">${it.phon ? '/' + esc(it.phon) + '/' : ''}</div><div class="cn-big" style="margin:8px 0">${esc(shortCn(it.cn) || '（暂无释义）')}</div></div>`;
  const grades = () => { const pv = preview(it.srs); return `<div class="grades">${[[0, '忘了'], [3, '模糊'], [4, '记得'], [5, '简单']].map(([g, l]) => `<button class="g${esc(g)}" data-g="${esc(g)}">${l}<small>${sess.graded ? fmtDur(pv[g]) : ''}</small></button>`).join('')}</div>`; };
  const bindGrades = () => view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => grade(it, +b.dataset.g));
  if (m === 'en' || m === 'cn') {
    view.innerHTML = top + `<div class="card flash" id="fc">${m === 'en' ? `<div class="q">${esc(it.text)}</div><button class="btn sm" id="pl">${ICON.spk} 再听</button>` : `<div class="qcn">${esc(shortCn(it.cn) || it.text)}</div>`}<div id="ansbox"></div><button class="btn pri" id="show" style="margin-top:16px;min-width:180px">显示答案</button></div><div id="gb"></div>`;
    if (m === 'en') { speak(it.text); $('#pl').onclick = e => { e.stopPropagation(); speak(it.text); }; }
    $('#show').onclick = () => { $('#show').remove(); $('#ansbox').innerHTML = ans; if (m === 'cn') speak(it.text); $('#gb').innerHTML = grades(); bindGrades(); };
  } else if (m === 'listen') {
    const opts = [it, ...distractors(it)].sort(() => Math.random() - .5);
    view.innerHTML = top + `<div class="card flash"><button class="bigplay" id="pl" aria-label="播放">${ICON.spk}</button><small class="hint">听发音，选出正确意思</small><div class="opts">${opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(shortCn(o.cn))}</button>`).join('')}</div><div id="ansbox"></div></div><div id="gb"></div>`;
    speak(it.text); $('#pl').onclick = () => speak(it.text);
    view.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (view.querySelector('.opt.ok')) return; const ok = opts[+b.dataset.k] === it;
      view.querySelectorAll('.opt').forEach((x, k) => { if (opts[k] === it) x.classList.add('ok'); }); if (!ok) b.classList.add('no');
      $('#ansbox').innerHTML = ans; autoNext(it, ok);
    });
  } else {
    view.innerHTML = top + `<div class="card flash"><button class="bigplay" id="pl" aria-label="播放">${ICON.spk}</button><div class="hint">${esc(shortCn(it.cn))}</div><input class="spell" id="sp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="拼写出你听到的"><div style="display:flex;gap:10px"><button class="btn" id="skip">不会</button><button class="btn pri" id="chk">确定</button></div><div id="ansbox"></div></div><div id="gb"></div>`;
    speak(it.text); $('#pl').onclick = () => speak(it.text);
    const norm = s => s.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
    const check = (give) => { if ($('#ansbox').innerHTML) return; const ok = !give && norm($('#sp').value) === norm(it.text); $('#sp').style.borderColor = ok ? 'var(--good)' : 'var(--bad)'; $('#ansbox').innerHTML = ans; autoNext(it, ok); };
    $('#chk').onclick = () => check(false); $('#skip').onclick = () => check(true); $('#sp').onkeydown = e => e.key === 'Enter' && check(false);
    setTimeout(() => $('#sp')?.focus(), 50);
  }
}
function autoNext(it, ok) { $('#gb').innerHTML = `<button class="btn pri" id="nx" style="width:100%;margin-top:14px;min-height:54px">${ok ? '✓ 答对了，下一个' : '✗ 记下了，下一个'}</button>`; $('#nx').onclick = () => grade(it, ok ? 4 : 0); }
async function grade(it, g) {
  if (sess.graded) {
    const first = !it.srs || !it.srs.firstAt; it.srs = review(it.srs || newSrs(), g); if (first) it.srs.firstAt = Date.now();
    it.updated = Date.now(); store.put('items', it);
  }
  if (g >= 3) sess.right++; else if (sess.graded) sess.list.push(it.id); // 忘了的本轮末尾再来
  sess.i++; showCard(); updateBadge();
}
function finish() { setTitle('完成'); view.innerHTML = `<div class="done card"><div class="e">🌿</div><h2>这一轮完成了</h2><p class="hint">共 ${sess.i} 次，记得 ${sess.right} 次</p><button class="btn pri" id="ok">好的</button></div>`; $('#ok').onclick = () => go('review'); updateBadge(); }

// ---------- 设置 ----------
VIEWS.settings = () => {
  setTitle('设置');
  const vs = englishVoices(); const seg = (k, opts, d) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${getKV(k, d) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  view.innerHTML = `<div class="sec">发音</div><div class="card set">
    <div><span>口音</span>${seg('accent', [['us', '美音'], ['uk', '英音']], 'us')}</div>
    <div><span>发音来源<small>有道：真人/合成发音，需联网（国内可用）<br>系统：手机自带语音，离线可用</small></span>${seg('engine', [['auto', '自动'], ['youdao', '有道'], ['system', '系统']], 'auto')}</div>
    <label><span>语速 <small id="rv">${getKV('rate', 1)}×</small></span><input type="range" id="rate" min="0.6" max="1.3" step="0.1" value="${getKV('rate', 1)}"></label>
    ${vs.length ? `<label><span>系统语音</span><select id="voice"><option value="">自动选择</option>${vs.map(v => `<option ${getKV('voice') === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    <div><span>试听</span><button class="btn sm" id="test">government leakage</button></div></div>
  <div class="sec">学习</div><div class="card set"><label><span>每天新词数量</span><select id="npd">${[10, 20, 30, 50, 100].map(n => `<option ${getKV('newPerDay', 20) == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div><span>外观</span>${seg('theme', [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']], 'auto')}</div></div>
  <div class="sec">手机 ⇄ 平板 同步</div><div class="card set">
    <div><span>隔空投送 / 文件<small>导出后用「隔空投送」发到另一台设备，那边点「导入文件」合并</small></span><button class="btn sm" id="exp">导出</button><button class="btn sm" id="imp">导入文件</button></div>
    <div><span>扫码同步<small>一台显示二维码，另一台扫一扫（不含照片）</small></span><button class="btn sm" id="qr">显示</button><button class="btn sm" id="scan">扫码</button></div>
    <div><span>自动云同步（可选）<small>用 GitHub Gist 保存，需要一个 token；两台设备填同样的就行</small></span><button class="btn sm" id="gist">${getKV('gistToken') ? '立即同步' : '设置'}</button></div></div>
  <div class="sec">数据</div><div class="card set"><div><span>共 ${mem.items.size} 个词 · ${mem.pages.size} 页<small>数据只保存在这台设备的浏览器里，记得定期导出备份</small></span></div>
    <div><span>清空所有数据</span><button class="btn sm danger" id="clr">清空</button></div></div>
  <p class="hint" style="text-align:center">拾词 v1.0 · 离线词典来自 ECDICT（MIT）</p>`;
  view.querySelectorAll('.seg').forEach(s => s.onclick = e => { const b = e.target.closest('button'); if (!b) return; setKV(s.dataset.k, b.dataset.v); s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); if (s.dataset.k === 'theme') applyTheme(); });
  $('#rate').oninput = e => { setKV('rate', +e.target.value); $('#rv').textContent = e.target.value + '×'; };
  $('#voice') && ($('#voice').onchange = e => setKV('voice', e.target.value));
  $('#npd').onchange = e => { setKV('newPerDay', +e.target.value); updateBadge(); };
  $('#test').onclick = () => speak('government leakage');
  $('#exp').onclick = exportFile; $('#imp').onclick = () => $('#fileJson').click();
  $('#qr').onclick = showQR; $('#scan').onclick = scanQR; $('#gist').onclick = gistUI;
  $('#clr').onclick = async () => { if (confirm('确定清空？建议先导出备份。') && confirm('真的清空吗？无法恢复。')) { await store.clearAll(); toast('已清空'); go('home'); } };
};
async function exportFile() {
  const blob = new Blob([JSON.stringify(sync.snapshot())], { type: 'application/json' });
  const name = `拾词备份-${new Date().toISOString().slice(0, 10)}.json`; const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: '拾词备份' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('已导出');
}
$('#fileJson').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const r = await sync.merge(JSON.parse(await f.text())); toast(`合并完成：新增 ${r.added}，更新 ${r.updated}`); go(route.name === 'settings' ? 'settings' : 'home', null, false); } catch (err) { toast('导入失败：' + err.message); } };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function showQR() {
  try { if (!window.qrcode) await loadScript('vendor/qrcode.min.js').catch(() => loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js')); } catch { return toast('二维码组件加载失败，请用文件导出'); }
  const data = 'VOCAB1:' + await sync.toB64(sync.compact());
  if (data.length > 2900) return toast(`数据太多（${mem.items.size} 词），请用「导出」文件或云同步`);
  const q = qrcode(0, 'L'); q.addData(data); q.make();
  openSheet(`<div class="grab"></div><b>在另一台设备上点「扫码」</b><p class="hint">${mem.items.size} 个词及复习进度</p><div class="qr">${q.createSvgTag({ scalable: true, margin: 2 })}</div><div class="playrow"><button class="btn" id="qc">关闭</button></div>`);
  $('#qc').onclick = closeSheet;
}
async function scanQR() {
  try { if (!window.jsQR) await loadScript('vendor/jsQR.min.js').catch(() => loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js')); } catch { return toast('扫码组件加载失败'); }
  openSheet(`<div class="grab"></div><b>对准另一台设备上的二维码</b><video class="scan" id="vid" playsinline muted></video><div class="playrow"><button class="btn" id="qimg">从照片识别</button><button class="btn" id="qc">取消</button></div>`);
  let stream, alive = true; const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  const done = async (txt) => { alive = false; stream?.getTracks().forEach(t => t.stop()); closeSheet(); try { const r = await sync.merge(sync.expand(await sync.fromB64(txt.replace(/^VOCAB1:/, '')))); toast(`同步完成：新增 ${r.added}，更新 ${r.updated}`); go('settings', null, false); } catch (e) { toast('二维码无效'); } };
  const tryImg = (src, w, h) => { c.width = w; c.height = h; g.drawImage(src, 0, 0, w, h); const r = jsQR(g.getImageData(0, 0, w, h).data, w, h); if (r && r.data.startsWith('VOCAB1:')) { done(r.data); return true; } };
  $('#qc').onclick = () => { alive = false; stream?.getTracks().forEach(t => t.stop()); closeSheet(); };
  $('#qimg').onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { const b = await createImageBitmap(inp.files[0]); const s = Math.min(1, 1200 / Math.max(b.width, b.height)); if (!tryImg(b, b.width * s | 0, b.height * s | 0)) toast('照片里没找到二维码'); }; inp.click(); };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = $('#vid'); v.srcObject = stream; await v.play();
    const loop = () => { if (!alive) return; if (v.videoWidth && tryImg(v, v.videoWidth, v.videoHeight)) return; requestAnimationFrame(loop); }; loop();
  } catch { toast('无法打开摄像头，可以用「从照片识别」'); }
}
function gistUI() {
  openSheet(`<div class="grab"></div><b>GitHub Gist 云同步</b><p class="hint">在 github.com → Settings → Developer settings → Personal access tokens 新建一个只勾选 <b>gist</b> 权限的 token。两台设备填同一个 token 和同步号即可。token 只存在本机。</p>
  <div class="card set"><label><span>Token</span><input type="password" id="gt" value="${esc(getKV('gistToken', ''))}" placeholder="ghp_…"></label><label><span>同步号<small>第一次留空，自动生成</small></span><input type="text" id="gi" value="${esc(getKV('gistId', ''))}"></label></div>
  <div class="playrow"><button class="btn" id="gc">关闭</button><button class="btn pri" id="gs">同步</button></div>`);
  $('#gc').onclick = closeSheet;
  $('#gs').onclick = async () => {
    const t = $('#gt').value.trim(); let id = $('#gi').value.trim(); if (!t) return toast('请先填 token');
    await setKV('gistToken', t); $('#gs').textContent = '同步中…';
    try { let r = { added: 0, updated: 0 }; if (id) r = await sync.gistPull(t, id); id = await sync.gistPush(t, id); await setKV('gistId', id); await setKV('gistAt', Date.now()); closeSheet(); toast(`已同步（新增 ${r.added}，更新 ${r.updated}）`); go('settings', null, false); }
    catch (e) { $('#gs').textContent = '同步'; toast(e.message + '，请检查 token / 网络'); }
  };
}
async function autoGist() { const t = getKV('gistToken'), id = getKV('gistId'); if (!t || !id || !navigator.onLine) return; try { await sync.gistPull(t, id); await sync.gistPush(t, id); updateBadge(); } catch {} }

// ---------- 启动 ----------
window.addEventListener('vocab-storage-error', () => toast(store.storageWarning));
(async () => {
  await store.init(); applyTheme();
  if (store.storageWarning) toast(store.storageWarning);
  history.replaceState({ name: 'home' }, ''); go('home', null, false);
  loadDict().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  autoGist(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { updateBadge(); autoGist(); } });
  window.__app = { store, mem, parseText, translate, speak, review, sync, go, importText };
})();

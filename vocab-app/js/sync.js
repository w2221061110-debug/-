// 同步：文件导出/导入（iOS 隔空投送）、二维码、GitHub Gist（可选）
import { mem, put } from './store.js';
export function snapshot({ thumbs = true } = {}) {
  return {
    app: 'vocab-app', v: 1, at: Date.now(),
    items: [...mem.items.values()],
    pages: [...mem.pages.values()].map(p => thumbs ? p : { ...p, thumb: '' }),
    kv: [...mem.kv.values()].filter(k => !/^(tr|img):/.test(String(k.id)) && !['gistToken'].includes(k.id)),
  };
}
/** 合并：同 id 以 updated 新者为准；复习记录取复习次数多/更晚的 */
export async function merge(data) {
  if (!data || data.app !== 'vocab-app') throw new Error('不是本应用的备份文件');
  const res = { items: { added: 0, updated: 0 }, pages: { added: 0, updated: 0 }, kv: { added: 0, updated: 0 } };
  for (const store of ['pages', 'items', 'kv']) for (const r0 of data[store] || []) {
    const r = r0 && typeof r0 === 'object' ? { ...r0 } : r0;
    if (!r || typeof r.id !== 'string' || (store === 'kv' && (r.id === 'gistToken' || r.id === 'dictVer'))) continue;
    if (store === 'items' && typeof r.text !== 'string') continue;
    if (store === 'pages' && (!Array.isArray(r.units) || r.units.some(u => !u || typeof u.text !== 'string'))) continue;
    if (store === 'items') r.pages = [...new Set([...(r.pages || []), r.page].filter(Boolean))];
    const cur = mem[store].get(r.id);
    if (!cur) { await put(store, r); res[store].added++; continue; }
    if (store === 'items') {
      // 同一个词在两台设备都有：保留各自所属的页（导入的页单独成组），进度取较新的
      const pages = [...new Set([...(cur.pages || []), cur.page, ...r.pages].filter(Boolean))];
      const newer = (r.updated || 0) > (cur.updated || 0);
      const rec = newer ? { ...r, page: cur.page || r.page } : { ...cur };
      if (pages.length !== (cur.pages || []).length || newer) { rec.pages = pages; await put(store, rec); res.items.updated++; }
      continue;
    }
    // 每日学习记录 / 打卡：两台设备取并集，不互相覆盖
    if (store === 'kv' && /^day:/.test(r.id) && Array.isArray(r.v?.ids)) { const ids = [...new Set([...(cur.v?.ids || []), ...r.v.ids])]; if (ids.length !== (cur.v?.ids || []).length) { await put('kv', { id: r.id, v: { ids }, updated: Date.now() }); res.kv.updated++; } continue; }
    if (store === 'kv' && r.id === 'checkins' && Array.isArray(r.v)) { const v = [...new Set([...(cur.v || []), ...r.v])].sort(); if (v.length !== (cur.v || []).length) { await put('kv', { id: 'checkins', v, updated: Date.now() }); res.kv.updated++; } continue; }
    if ((r.updated || 0) > (cur.updated || 0)) { if (store === 'pages' && !r.thumb) r.thumb = cur.thumb; await put(store, r); res[store].updated++; }
  }
  // 兼容旧调用
  res.added = res.items.added; res.updated = res.items.updated;
  return res;
}
export function summary(r, head = '导入完成') {
  const w = r.items || r, p = r.pages || { added: 0, updated: 0 };
  return `${head}：单词新增 ${w.added}、更新 ${w.updated}` + (p.added || p.updated ? `；页面新增 ${p.added}、更新 ${p.updated}` : '');
}
export async function toB64(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = ''; for (const b of buf) s += String.fromCharCode(b); return btoa(s);
}
export async function fromB64(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const ds = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(ds).text());
}
// 二维码只放精简数据（单词+释义+复习进度），不含图片
export function compact() {
  return { app: 'vocab-app', v: 1, at: Date.now(), c: 1, items: [...mem.items.values()].map(i => [i.text, i.cn || '', i.srs ? [i.srs.reps, Math.round(i.srs.ease * 100), i.srs.interval, Math.round(i.srs.due / 60000), i.srs.lapses, i.srs.firstAt || 0, i.srs.last || 0] : 0, i.updated, i.page || '', i.cut || 0]) };
}
export function expand(c) {
  return { app: 'vocab-app', v: 1, items: c.items.map(([text, cn, s, updated, page, cut]) => ({ id: text.toLowerCase(), text, cn, page, cut: cut || null, pages: page ? [page] : [], updated, created: updated, srs: s ? { reps: s[0], ease: s[1] / 100, interval: s[2], due: s[3] * 60000, lapses: s[4], firstAt: s[5] || 0, last: s[6] || 0 } : null })) };
}
// ---- Gist ----
const API = 'https://api.github.com/gists';
const FILE = 'vocab-app-sync.json';
export async function gistPush(token, gistId) {
  const body = { description: '背单词同步（vocab-app）', public: false, files: { [FILE]: { content: JSON.stringify(snapshot({ thumbs: false })) } } };
  const r = await fetch(gistId ? `${API}/${gistId}` : API, { method: gistId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('上传失败 ' + r.status); return (await r.json()).id;
}
export async function gistPull(token, gistId) {
  const r = await fetch(`${API}/${gistId}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error('下载失败 ' + r.status);
  const f = (await r.json()).files?.[FILE]; if (!f) throw new Error('没有同步数据');
  const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return merge(JSON.parse(txt));
}

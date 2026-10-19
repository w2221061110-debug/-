// 词典查询 + 在线翻译（多源回退 + 缓存）
import { getKV, setKV } from './store.js';
/** 词典或清洗规则变化时 +1，会触发已存单词重新翻译 */
export const DICT_VERSION = 2;
let dict = null, lemma = null, loading = null;
export function loadDict() {
  if (dict) return Promise.resolve();
  return loading ||= fetch('data/dict.txt').then(r => r.text()).then(t => {
    dict = new Map(); lemma = new Map(); let lem = false;
    for (const line of t.split('\n')) {
      if (line === '#LEMMA') { lem = true; continue; }
      const a = line.split('\t'); if (a.length < 2) continue;
      lem ? lemma.set(a[0], a[1]) : dict.set(a[0], { p: a[1], t: a[2] });
    }
  });
}
export function lookupLocal(text) {
  if (!dict) return null;
  const k = text.toLowerCase().replace(/[’]/g, "'").trim();
  const tryKey = w => dict.get(w) && { word: w, phon: dict.get(w).p, cn: dict.get(w).t };
  let r = tryKey(k); if (r) return r;
  if (!k.includes(' ')) {
    const base = lemma.get(k); if (base && (r = tryKey(base))) return { ...r, base };
    for (const [suf, rep] of [['ies', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e'], ['ly', '']])
      if (k.endsWith(suf) && (r = tryKey(k.slice(0, -suf.length) + rep))) return { ...r, base: r.word };
  }
  return null;
}
/** 规范在线译文：去多余空格，英文标点→中文标点 */
export function normCn(t) { return String(t || '').replace(/\s*([,，;；、])\s*/g, (m, c) => (c === ',' ? '，' : c === ';' ? '；' : c)).replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '').replace(/^[，；\s]+|[，；\s]+$/g, '').trim(); }
/** 短语没有整体音标时，用每个词的音标拼起来（缺任何一个就不显示） */
export function phraseIpa(text) { const ws = text.toLowerCase().split(/\s+/); if (ws.length < 2) return ''; const ps = ws.map(w => lookupLocal(w.replace(/[^a-z'\-]/g, ''))?.phon || (/^(sb|sth)$/.test(w) ? w : '')); return ps.every(Boolean) ? ps.join(' ') : ''; }
export function shortCn(cn) { return (cn || '').split('；').slice(0, 2).join('；').replace(/\s+/g, ' '); }
function timeout(p, ms) { return Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error('timeout')), ms))]); }
const sources = {
  async mymemory(q) {
    const r = await timeout(fetch('https://api.mymemory.translated.net/get?langpair=en|zh-CN&q=' + encodeURIComponent(q)), 6000);
    const j = await r.json(); const t = j?.responseData?.translatedText;
    if (!t || /MYMEMORY|QUERY LENGTH|INVALID/i.test(t) || !/[\u4e00-\u9fff]/.test(t)) throw new Error('bad'); return t;
  },

};
/** 返回 {cn, phon, source} */
export async function translate(text, { online = true } = {}) {
  await loadDict();
  const local = lookupLocal(text);
  if (local) return { cn: local.cn, phon: local.phon || phraseIpa(text), base: local.base, source: '离线词典' };
  const cache = getKV('tr:' + text.toLowerCase());
  if (cache) return { ...cache, cn: normCn(cache.cn), phon: cache.phon || phraseIpa(text) };
  if (online && navigator.onLine !== false) {
    for (const [name, fn] of Object.entries(sources)) {
      try { const cn = await fn(text); const res = { cn: normCn(cn), phon: phraseIpa(text), source: name === 'google' ? '谷歌翻译' : 'MyMemory' }; setKV('tr:' + text.toLowerCase(), res); return res; } catch {}
    }
  }
  // 逐词拼接兜底
  const parts = text.split(/\s+/).map(w => { const l = lookupLocal(w.replace(/[^A-Za-z'\-]/g, '')); return l ? `${w}：${shortCn(l.cn).split(/[，,；]/)[0]}` : null; }).filter(Boolean);
  return { cn: parts.length ? parts.join(' / ') : '（暂无释义，联网后再试）', source: parts.length ? '逐词释义' : '', weak: true };
}

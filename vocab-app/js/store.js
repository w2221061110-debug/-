// IndexedDB 存储：pages / items / kv。启动时全部读入内存。
const DB = 'vocab-app', VER = 1;
export let storageWarning = '';
function failed() { db = null; storageWarning = '存储不可用或空间不足：当前更改仅保存在内存，关闭前请导出备份。'; window.dispatchEvent(new Event('vocab-storage-error')); }
let db; export const mem = { pages: new Map(), items: new Map(), kv: new Map() };
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { for (const s of ['pages', 'items', 'kv']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out?.result ?? out); t.onerror = t.onabort = () => rej(t.error || new Error('存储事务中止')); });
}
export async function init() {
  try { db = await open();
  for (const s of ['pages', 'items', 'kv']) {
    const all = await tx(s, 'readonly', st => st.getAll());
    for (const r of all) mem[s].set(r.id, r);
  }
  } catch { failed(); }
  try { await navigator.storage?.persist?.(); } catch {}
}
function changed() { try { window.dispatchEvent(new Event('vocab-changed')); } catch {} }
export function put(store, rec) { changed(); rec.updated = rec.updated || Date.now(); mem[store].set(rec.id, rec); return db ? tx(store, 'readwrite', s => s.put(rec)).catch(failed) : Promise.resolve(); }
export function del(store, id) { changed(); mem[store].delete(id); return db ? tx(store, 'readwrite', s => s.delete(id)).catch(failed) : Promise.resolve(); }
export function getKV(k, d) { return mem.kv.has(k) ? mem.kv.get(k).v : d; }
export function setKV(k, v) { return put('kv', { id: k, v, updated: Date.now() }); }
export async function clearAll() { changed(); for (const s of ['pages', 'items', 'kv']) { mem[s].clear(); if (db) await tx(s, 'readwrite', st => st.clear()).catch(failed); } }

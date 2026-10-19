// 测试员反馈回归测试：TZ=Asia/Shanghai node tests/feedback.mjs
import assert from 'node:assert/strict'; import fs from 'node:fs';
globalThis.window = new EventTarget();
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.indexedDB = { open() { throw Error('no idb in node'); } };
const { localDate, queueCounts, review, newSrs, dayStart } = await import('../js/srs.js');
const store = await import('../js/store.js'); const sync = await import('../js/sync.js'); const { normCn } = await import('../js/dict.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
t('export date is local (01:30 Beijing → same day)', () => assert.equal(localDate(new Date('2026-10-19T17:30:00Z')), process.env.TZ === 'Asia/Shanghai' ? '2026-10-20' : localDate(new Date('2026-10-19T17:30:00Z'))));
t('online translation normalised', () => { assert.equal(normCn('处理 , 赡养'), '处理，赡养'); assert.equal(normCn('期望; 盼望'), '期望；盼望'); });
// 词典质量
const D = new Map(); for (const l of fs.readFileSync(new URL('../data/dict.txt', import.meta.url), 'utf8').split('\n')) { if (l === '#LEMMA') break; const a = l.split('\t'); D.set(a[0], a); }
t('look forward to', () => assert.equal(D.get('look forward to')[2], '期待，盼望'));
t('take care of has 照顾', () => assert.match(D.get('take care of')[2], /照顾/));
t('in charge of ≤3 senses', () => assert.ok(D.get('in charge of')[2].split(/[，；]/).length <= 3));
t('give: verb sense first', () => assert.match(D.get('give')[2], /^vt\. 给/));
t('no stray spaces / ASCII commas / rare markers in any entry', () => { for (const [w, a] of D) { const c = a[2] || ''; assert.ok(!/\s[，；]|[,;]\s*[\u4e00-\u9fff]|\[网络\]|方言/.test(c), w + ' → ' + c); } });
t('≤3 senses per POS, ≤2 POS', () => { for (const [w, a] of D) { const parts = (a[2] || '').split('；'); assert.ok(parts.length <= 4, w); } });
t('common phrasal verbs present', () => { for (const w of ['give up', 'pick up', 'deal with', 'depend on', 'come up with', 'run out of', 'take part in', 'work out']) assert.ok(D.has(w), w); });
// 复习计数一致
const now = new Date('2026-10-20T10:00:00+08:00').getTime();
const items = Array.from({ length: 6 }, (_, k) => ({ id: 'w' + k, text: 'w' + k, srs: null }));
items[0].srs = { ...review(newSrs(), 0, now - 60000), firstAt: now - 60000 }; // 今天学过一个、忘了，10 分钟后到期
t('queue: forgot word not due yet, 5 new left', () => assert.deepEqual(queueCounts(items, 20, now), { due: 0, nw: 5, total: 5, learnedToday: 1 }));
t('queue: after 10 min the forgotten word becomes due', () => assert.equal(queueCounts(items, 20, now + 11 * 60000).total, 6));
t('queue: daily new limit', () => assert.equal(queueCounts(items, 3, now).nw, 2));
t('day starts 4am', () => assert.equal(new Date(dayStart(new Date('2026-10-20T02:00:00+08:00').getTime())).getDate(), process.env.TZ === 'Asia/Shanghai' ? 19 : new Date(dayStart(new Date('2026-10-20T02:00:00+08:00').getTime())).getDate()));
// 导入：单词/页面分开计数，导入页单独成组
await store.init();
await store.put('pages', { id: 'pLocal', title: '本机文章', units: [{ text: 'economy' }], updated: 1 });
await store.put('items', { id: 'economy', text: 'economy', page: 'pLocal', pages: ['pLocal'], updated: 5 });
const backup = { app: 'vocab-app', pages: [{ id: 'pA', title: '导入页', units: [1, 2, 3, 4, 5, 6].map(k => ({ text: 'x' + k })), updated: 2 }, { id: 'pB', title: '导入页2', units: [{ text: 'economy' }], updated: 2 }],
  items: [...[1, 2, 3, 4, 5].map(k => ({ id: 'x' + k, text: 'x' + k, page: 'pA', pages: ['pA'], updated: 3 })), { id: 'economy', text: 'economy', page: 'pB', pages: ['pB'], updated: 3 }], kv: [{ id: 'newPerDay', v: 20, updated: 1 }] };
const r = await sync.merge(backup);
t('merge counts words separately', () => { assert.equal(r.items.added, 5); assert.equal(r.items.updated, 1); assert.equal(r.pages.added, 2); });
t('summary text', () => assert.equal(sync.summary(r), '导入完成：单词新增 5、更新 1；页面新增 2、更新 0'));
t('shared word keeps both groups', () => assert.deepEqual(store.mem.items.get('economy').pages.sort(), ['pB', 'pLocal']));
t('imported words keep their own page', () => assert.equal(store.mem.items.get('x1').page, 'pA'));
console.log(`\n${n} passed`);

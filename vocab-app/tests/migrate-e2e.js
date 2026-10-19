// 旧数据升级 + 重复导入去重 + 复习标签。URL=... node tests/migrate-e2e.js
const { chromium } = require('playwright');
const URL0 = process.env.URL || 'http://localhost:8800/vocab-app/index.html';
let fails = 0; const ok = (k, c, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', k, x); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [name, w, h, t] of [['phone', 390, 844, true], ['ipad', 820, 1180, true], ['desktop', 1440, 900, false]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: t, isMobile: t });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + e.message)); p.on('console', m => m.type() === 'error' && errs.push(name + m.text()));
    const click = s => t ? p.tap(s) : p.click(s);
    await p.goto(URL0); await p.waitForSelector('.hero');
    // 模拟旧版本留下的数据（旧字符串 + 旧在线缓存 + 无 dictVer）
    await p.evaluate(async () => { const s = __app.store; const now = Date.now();
      await s.put('pages', { id: 'pOld', title: '旧页', created: now, raw: '1. look forward to\n2. take care of\n3. in charge of\n4. government leakage', mode: 'list', units: [{ text: 'look forward to', num: '1' }, { text: 'take care of', num: '2' }, { text: 'in charge of', num: '3' }, { text: 'government leakage', num: '4' }], updated: now });
      const old = { 'look forward to': ' 期望, 盼望; 瞩望; 属望; 企', 'take care of': '处理 , 赡养', 'in charge of': '负责..., 管理..., 主管..., 掌管..., 看管..., 在...掌管/看管之下', 'government leakage': '政府泄漏' };
      for (const [k, v] of Object.entries(old)) await s.put('items', { id: k, text: k, cn: v, phon: '', page: 'pOld', pages: ['pOld'], created: now, updated: now, srs: null, src: 'MyMemory' });
      await s.setKV('tr:take care of', { cn: '处理 , 赡养', source: 'MyMemory' }); await s.setKV('tr:government leakage', { cn: '政府泄漏', source: 'MyMemory' }); await s.setKV('dictVer', 1); });
    await p.reload(); await p.waitForSelector('.hero'); await p.waitForTimeout(500);
    const got = await p.evaluate(() => Object.fromEntries(['look forward to', 'take care of', 'in charge of', 'government leakage'].map(k => [k, __app.mem.items.get(k).cn])));
    ok(name + ' old look forward to → 期待，盼望', got['look forward to'] === '期待，盼望', got['look forward to']);
    ok(name + ' old take care of → 照顾；处理', got['take care of'] === '照顾；处理', got['take care of']);
    ok(name + ' old in charge of → 负责，主管', got['in charge of'] === '负责，主管');
    ok(name + ' online cache cleared', await p.evaluate(() => ![...__app.mem.kv.keys()].some(k => String(k).startsWith('tr:'))));
    await click('.pg >> nth=0'); await p.waitForSelector('.unit'); await p.waitForTimeout(800);
    const shown = await p.$$eval('.unit .cn', e => e.map(x => x.textContent)); ok(name + ' page shows new strings', shown[0] === '期待，盼望' && shown[1] === '照顾；处理', JSON.stringify(shown));
    // 重复导入去重
    const txt = '1. give up\n2. pick up\n3. set up';
    await p.evaluate(t => __app.importText(t), txt); await p.waitForSelector('.unit'); const n1 = await p.evaluate(() => __app.mem.pages.size);
    await p.evaluate(t => __app.importText(t), txt); await p.waitForTimeout(400); const n2 = await p.evaluate(() => __app.mem.pages.size);
    const tt = await p.$eval('#toast', e => e.textContent); ok(name + ' duplicate import not created + toast', n2 === n1 && /已经导入过/.test(tt), tt);
    await p.screenshot({ path: `shots/mig-${name}-dup-toast.png` });
    await click('.toast-btn'); await p.waitForTimeout(500); ok(name + ' 仍然新建 creates new page', (await p.evaluate(() => __app.mem.pages.size)) === n1 + 1);
    // 同一张图片两次
    await click('[data-tab=home]'); await p.setInputFiles('#fileImg', 'tests/img/phrases.jpg'); await p.waitForSelector('.unit', { timeout: 120000 }); const m1 = await p.evaluate(() => __app.mem.pages.size);
    await click('[data-tab=home]'); await p.setInputFiles('#fileImg', 'tests/img/phrases.jpg'); await p.waitForSelector('.unit', { timeout: 120000 }); await p.waitForTimeout(300);
    ok(name + ' same photo twice → no duplicate', (await p.evaluate(() => __app.mem.pages.size)) === m1);
    // 复习标签
    await click('[data-tab=review]'); const st = await p.$eval('#start', e => e.textContent); const badge = await p.$eval('#badge', e => +e.textContent);
    ok(name + ' review label shows 到期·新词 and matches badge', /到期 \d+ · 新词 \d+/.test(st) && st.includes(`开始复习 ${badge} 个`), `${st} badge=${badge}`);
    // 旧版本备份导入也会被清洗
    await p.evaluate(async () => { await __app.store.clearAll(); await __app.store.setKV('dictVer', 2); });
    await ctx.close();
  }
  ok('no console errors', !errs.length, JSON.stringify(errs.slice(0, 3)));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();

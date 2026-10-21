// 词包链接 ?pack=macro：确认弹窗→合并导入→去掉参数；再开提示已导入；坏名字；旧 SW(v9) 升级场景（SITE_DIR 指向可替换的站点目录）
const { chromium, devices } = require('playwright');
const fs = require('fs'), cp = require('child_process');
const URL0 = process.env.URL || 'http://localhost:8811/vocab-app/index.html';
let fails = 0; const ok = (k, c, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', k, x); };
const sheetText = p => p.$eval('#sheet', e => e.textContent).catch(() => '');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.route(/jsdelivr\.net|googleapis\.com|google\.com|githack|gstatic/, r => r.abort()); // 模拟国内
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  // 已有旧数据
  await p.goto(URL0); await p.waitForSelector('.hero');
  await p.evaluate(() => __app.importText('1. look forward to\n2. deficit', '旧数据')); await p.waitForTimeout(800);
  await p.goto(URL0 + '?pack=macro'); await p.waitForSelector('#pko', { timeout: 10000 }).catch(() => {});
  const t = await sheetText(p); ok('confirm sheet text', /导入「宏观经济词表」354 个词？/.test(t), t.slice(0, 40));
  ok('url param removed', !(await p.evaluate(() => location.search)));
  await p.tap('#pko'); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({ n: __app.store.mem.items.size, pages: __app.store.mem.pages.size, leak: __app.store.mem.items.get('leakage')?.cn, lf: !!__app.store.mem.items.get('look forward to'), title: document.querySelector('#title').textContent }));
  ok('merged: 2 old + 353 new', st.n === 355, st.n); ok('pages 12', st.pages === 12); ok('old word kept', st.lf); ok('pdf chinese', st.leak === '漏出'); ok('went to wordbook', st.title === '生词本', st.title);
  await p.reload(); await p.waitForTimeout(1200); ok('refresh does not re-prompt', (await p.$('#sheetWrap:not([hidden]) #pko')) === null);
  await p.goto(URL0 + '?pack=macro'); await p.waitForTimeout(1500);
  ok('second open says already imported', /已经导入过/.test(await p.$eval('#toast', e => e.textContent)) && (await p.$eval('#title', e => e.textContent)) === '生词本');
  ok('no duplicate', (await p.evaluate(() => __app.store.mem.items.size)) === 355);
  await p.goto(URL0 + '?pack=../sync'); await p.waitForTimeout(1000); ok('bad pack name rejected', /无效/.test(await p.$eval('#toast', e => e.textContent)));
  await p.goto(URL0 + '?pack=nope'); await p.waitForTimeout(1500); ok('missing pack -> error toast', /下载失败/.test(await p.$eval('#toast', e => e.textContent)));
  // 取消
  const c2 = await b.newContext({ ...devices['iPhone 13'] }); const q = await c2.newPage();
  await q.goto(URL0 + '?pack=macro'); await q.waitForSelector('#pkc'); await q.tap('#pkc'); await q.waitForTimeout(400);
  ok('cancel imports nothing', (await q.evaluate(() => __app.store.mem.items.size)) === 0);
  ok('no page errors', !errs.length, errs.join('|'));
  // 旧 SW 场景
  if (process.env.SITE_DIR && process.env.OLD_DIR && process.env.NEW_DIR) {
    const S = process.env.SITE_DIR; const sync = src => cp.execSync(`rm -rf ${S}/vocab-app && cp -r ${src} ${S}/vocab-app`);
    sync(process.env.OLD_DIR); const SU = process.env.SITE_URL;
    const c3 = await b.newContext({ ...devices['iPhone 13'] }); const r = await c3.newPage();
    await r.goto(SU); await r.waitForSelector('.hero'); await r.evaluate(() => navigator.serviceWorker.ready); await r.reload(); await r.waitForTimeout(800);
    const v0 = await r.evaluate(() => caches.keys()); sync(process.env.NEW_DIR);
    await r.goto(SU + '?pack=macro'); await r.waitForSelector('#pko', { timeout: 10000 }).catch(() => {});
    ok('old sw (' + v0 + ') still shows pack prompt', /354 个词/.test(await sheetText(r)));
    await r.tap('#pko'); await r.waitForTimeout(1500); ok('old sw import works', (await r.evaluate(() => __app.store.mem.items.size)) === 354);
    await r.waitForTimeout(1500); ok('new sw cache shici-v10', (await r.evaluate(() => caches.keys())).includes('shici-v10'), JSON.stringify(await r.evaluate(() => caches.keys())));
  }
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();

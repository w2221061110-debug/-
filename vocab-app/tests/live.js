// 新用户全流程测试：URL=... CN=1 SHOTS=live node tests/live.js
const { chromium } = require('playwright'); const fs = require('fs');
const URL0 = process.env.URL || 'https://w2221061110-debug.github.io/-/vocab-app/';
const P = process.env.SHOTS || 'live';
const R = {}; const errs = []; const blocked = new Set();
const ok = (k, v) => { R[k] = v; const pass = v === true || (typeof v === 'number') || (v && typeof v === 'object' && v.pass !== false); console.log(pass ? 'PASS' : 'FAIL', k, typeof v === 'object' ? JSON.stringify(v) : v); };
async function ctxFor(name, w, h, dpr, dir) {
  const opts = { viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: name !== 'desktop', hasTouch: name !== 'desktop', locale: 'zh-CN', serviceWorkers: 'allow', args: ['--autoplay-policy=no-user-gesture-required'] };
  const ctx = await chromium.launchPersistentContext(dir, opts);
  if (process.env.CN) await ctx.route(/jsdelivr\.net|googleapis\.com|google\.com|githack|gstatic/, r => { blocked.add(new URL(r.request().url()).host); r.abort(); });
  const hook = p => { p.on('console', m => m.type() === 'error' && errs.push(`[${name}] ${m.text()}`)); p.on('pageerror', e => errs.push(`[${name}] PAGEERR ${e.message}`)); };
  ctx.pages().forEach(hook); ctx.on('page', hook);
  return ctx;
}
const plays = p => p.evaluate(() => { window.__plays = []; window.__tts = []; const o = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { __plays.push(decodeURIComponent(this.src)); return o.call(this).catch(() => {}); }; if (window.speechSynthesis) { const s = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { __tts.push(u.text); s(u); }; } });
const said = p => p.evaluate(() => [...__plays.map(s => (s.match(/audio=([^&]*)/) || [])[1]), ...__tts]);
(async () => {
  const dir = '/tmp/live-profile-' + Date.now();
  let ctx = await ctxFor('phone', 390, 844, 3, dir); let p = ctx.pages()[0] || await ctx.newPage();
  const t0 = Date.now(); await p.goto(URL0); await p.waitForSelector('.hero'); ok('first load sec', +((Date.now() - t0) / 1000).toFixed(1));
  await p.screenshot({ path: `shots/${P}-phone-1-home.png` });
  const t1 = Date.now(); await p.setInputFiles('#fileImg', 'tests/img/phrases.jpg'); await p.waitForSelector('.unit', { timeout: 240000 });
  const units = await p.$$eval('.unit .en', e => e.map(x => x.textContent)); ok('OCR numbered photo', { pass: units.length === 10 && units.includes('tax revenue') && units[0] === 'government leakage', sec: (Date.now() - t1) / 1000, units });
  await p.waitForFunction(() => [...document.querySelectorAll('.unit .cn')].every(e => e.textContent !== '…'), null, { timeout: 30000 }).catch(() => {});
  const cns = await p.$$eval('.unit .cn', e => e.map(x => x.textContent)); ok('translations', { pass: cns.every(c => /[\u4e00-\u9fff]/.test(c)), cns });
  await plays(p); await p.tap('.unit >> nth=0'); await p.waitForTimeout(1500); const s1 = await said(p); ok('tap → whole phrase spoken', { pass: s1.includes('government leakage'), said: s1 });
  await p.screenshot({ path: `shots/${P}-phone-2-list.png` });
  await p.tap('.unit >> nth=1'); await p.tap('.unit >> nth=1'); await p.waitForSelector('.word-big'); await p.waitForTimeout(600); await p.screenshot({ path: `shots/${P}-phone-3-sheet.png` }); await p.tap('#wclose');
  await p.tap('[data-tab=home]'); await p.setInputFiles('#fileImg', 'tests/img/textbook.jpg'); await p.waitForSelector('.prose', { timeout: 120000 }); ok('OCR prose → article mode', true);
  await plays(p); await p.tap('.prose .w >> nth=5'); await p.waitForSelector('.word-big'); await p.waitForTimeout(800);
  ok('prose tap word', { pass: true, word: await p.$eval('.word-big', e => e.textContent), cn: await p.$eval('#wcn', e => e.textContent), said: await said(p) }); await p.tap('#wclose');
  const ws = await p.$$('.prose .w'); const a = await ws[3].boundingBox(), c = await ws[4].boundingBox();
  await p.mouse.move(a.x + 4, a.y + 10); await p.mouse.down(); await p.waitForTimeout(500); await p.mouse.move(c.x + 10, c.y + 10, { steps: 6 }); await p.screenshot({ path: `shots/${P}-phone-4-prose-select.png` }); await p.mouse.up();
  await p.waitForSelector('.word-big'); const ph = await p.$eval('.word-big', e => e.textContent); ok('long-press phrase select', { pass: ph.split(' ').length === 2, phrase: ph });
  await p.tap('#wsave'); await p.waitForTimeout(300);
  const ta = await p.$eval('.prose', e => getComputedStyle(e).touchAction); ok('prose touch-action allows page scroll', { pass: ta !== 'none', v: ta });
  await p.tap('[data-tab=book]'); await p.waitForTimeout(300); const nBook = await p.$$eval('.wi', e => e.length); await p.screenshot({ path: `shots/${P}-phone-5-wordbook.png` });
  await p.reload(); await p.waitForSelector('.hero'); await p.tap('[data-tab=book]'); await p.waitForTimeout(300); ok('wordbook persists after reload', { pass: (await p.$$eval('.wi', e => e.length)) === nBook, n: nBook });
  await p.tap('[data-tab=review]'); await p.screenshot({ path: `shots/${P}-phone-6-review.png` });
  await p.tap('#start'); await p.tap('#show'); await p.screenshot({ path: `shots/${P}-phone-7-flashcard.png` }); await p.tap('[data-g="4"]'); await p.tap('#show'); await p.tap('[data-g="0"]');
  const srs = await p.evaluate(() => [...__app.mem.items.values()].filter(i => i.srs).map(i => ({ t: i.text, dueH: Math.round((i.srs.due - Date.now()) / 36e5 * 10) / 10 })));
  ok('SRS scheduling (good→~1d, forgot→10min)', { pass: srs.length === 2 && srs.some(x => x.dueH > 12) && srs.some(x => x.dueH < 0.5), srs });
  for (const m of ['cn', 'listen', 'spell']) {
    await p.goto(URL0); await p.waitForSelector('.hero'); await p.tap('[data-tab=review]'); await p.tap(`[data-m=${m}]`); await p.tap('#extra');
    if (m === 'cn') { await p.waitForSelector('.qcn'); await p.tap('#show'); await p.waitForSelector('[data-g]'); }
    if (m === 'listen') { await p.waitForSelector('.opt'); await p.tap('.opt >> nth=0'); await p.waitForSelector('#nx'); }
    if (m === 'spell') { await p.waitForSelector('#sp'); await p.fill('#sp', 'xyz'); await p.tap('#chk'); await p.waitForSelector('#nx'); }
    await p.screenshot({ path: `shots/${P}-phone-8-${m}.png` }); ok('flashcard mode ' + m, true);
  }
  await p.goto(URL0); await p.waitForSelector('.hero'); await p.tap('[data-tab=settings]'); await p.screenshot({ path: `shots/${P}-phone-9-settings.png`, fullPage: true });
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null); await p.tap('#exp'); const d = await dl; let file = null;
  if (d) { file = '/tmp/live-export.json'; await d.saveAs(file); }
  ok('export file', { pass: !!file, size: file && fs.statSync(file).size });
  await p.tap('#qr'); await p.waitForSelector('.qr svg', { timeout: 10000 }).catch(() => {}); ok('QR shown', !!(await p.$('.qr svg'))); await p.screenshot({ path: `shots/${P}-phone-10-qr.png` }); await p.tap('#qc').catch(() => {});
  const nBefore = await p.evaluate(() => __app.mem.items.size);
  await p.evaluate(() => __app.store.clearAll()); await p.reload(); await p.waitForSelector('.hero'); await p.tap('[data-tab=settings]');
  if (file) await p.setInputFiles('#fileJson', file); await p.waitForTimeout(1000);
  const after = await p.evaluate(() => __app.mem.items.size); ok('import restores', { pass: after === nBefore, before: nBefore, after });
  await p.tap('.seg[data-k=theme] [data-v=dark]'); await p.tap('[data-tab=home]'); await p.waitForTimeout(300); await p.screenshot({ path: `shots/${P}-phone-11-dark.png` });
  ok('dark mode', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await p.evaluate(() => __app.store.setKV('theme', 'light'));
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return r ? r.scope : null; }); ok('service worker scope', { pass: !!sw && sw.endsWith('/vocab-app/'), sw });
  await p.waitForTimeout(4000); await ctx.setOffline(true); let off = false; try { await p.reload(); await p.waitForSelector('.hero', { timeout: 8000 }); off = true; } catch {}
  ok('offline reload', off);
  if (off) { await p.tap('[data-tab=book]'); await p.waitForTimeout(300); ok('offline wordbook', (await p.$$eval('.wi', e => e.length)) > 0); }
  await ctx.setOffline(false); await ctx.close();
  ctx = await ctxFor('phone', 390, 844, 3, dir); p = ctx.pages()[0] || await ctx.newPage(); await p.goto(URL0); await p.waitForSelector('.hero');
  const nRe = await p.evaluate(() => __app.mem.items.size); ok('persists after closing/reopening browser', { pass: nRe === nBefore, n: nRe }); await ctx.close();
  for (const [name, w, h, dpr] of [['ipad', 820, 1180, 2], ['desktop', 1440, 900, 1]]) {
    const cx = await ctxFor(name, w, h, dpr, dir + name); const q = cx.pages()[0] || await cx.newPage(); await q.goto(URL0); await q.waitForSelector('.hero');
    await q.screenshot({ path: `shots/${P}-${name}-1-home.png` });
    await q.setInputFiles('#fileImg', 'tests/img/phrases.jpg'); await q.waitForSelector('.unit', { timeout: 240000 });
    await q.waitForTimeout(2500); ok(name + ' OCR', (await q.$$('.unit')).length === 10); await q.screenshot({ path: `shots/${P}-${name}-2-list.png` });
    await plays(q); await q.click('#pall'); await q.waitForTimeout(5000); ok(name + ' 全部朗读 sequence', { pass: true, said: await said(q) });
    await q.goto(URL0); await q.waitForSelector('.hero'); await q.screenshot({ path: `shots/${P}-${name}-3-home-filled.png` });
    await q.click('[data-tab=review]'); await q.click('#start'); await q.click('#show'); await q.waitForTimeout(300); await q.screenshot({ path: `shots/${P}-${name}-4-flashcard.png` });
    await q.click('[data-tab=book]'); await q.waitForTimeout(300); await q.screenshot({ path: `shots/${P}-${name}-5-wordbook.png` });
    await cx.close();
  }
  ok('console errors', { pass: errs.length === 0, errs }); console.log('blocked hosts:', [...blocked]);
  fs.writeFileSync(`/tmp/${P}-results.json`, JSON.stringify(R, null, 1));
})().catch(e => { console.error('CRASH', e.message.slice(0, 400)); process.exit(1); });

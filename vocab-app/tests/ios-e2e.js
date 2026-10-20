// iPhone 回归：默认用 <audio>(有道) 发音（静音开关下也有声）；跨行长按拖选；点词弹读音释义；正文上滑动仍能滚动页面
const { chromium, devices } = require('playwright');
const URL0 = process.env.URL || 'http://localhost:8800/vocab-app/index.html';
let fails = 0; const ok = (k, c, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', k, x); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { window.__tts = 0; if (window.speechSynthesis) speechSynthesis.speak = () => { window.__tts++; }; HTMLMediaElement.prototype.play = function () { if (/youdao/.test(this.src)) (window.__said ||= []).push(decodeURIComponent(this.src.match(/audio=([^&]*)/)[1])); setTimeout(() => this.dispatchEvent(new Event('ended')), 30); return Promise.resolve(); }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p); const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8 }] });
  await p.goto(URL0); await p.waitForSelector('.hero');
  const long = Array.from({ length: 12 }, (_, i) => `Line ${i} holistic education is more superior for students and the government profit matters.`).join('\n');
  await p.evaluate(t => __app.importText(t), long); await p.waitForSelector('.prose');
  const c = async i => p.$$eval('.prose .w', (ws, i) => { const r = ws[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, ws[i].textContent]; }, i);
  // 点词
  let [x, y, t] = await c(3); await T('touchStart', x, y); await T('touchEnd'); await p.waitForTimeout(500);
  ok('tap opens sheet', (await p.$eval('.word-big', e => e.textContent).catch(() => '')) === t);
  ok('tap shows phonetic', ((await p.$eval('#wph', e => e.textContent).catch(() => '')) || '').includes('/'));
  ok('iPhone default engine uses <audio> youdao', (await p.evaluate(() => window.__said || [])).includes(t), JSON.stringify(await p.evaluate(() => [window.__said, window.__tts])));
  await p.evaluate(() => document.querySelector('#wclose')?.click());
  // 长按后往下拖（跨行），页面不能滚走
  const s0 = await p.evaluate(() => scrollY); const a = await c(0); const z = await c(14);
  await T('touchStart', a[0], a[1]); await p.waitForTimeout(420);
  for (let i = 1; i <= 8; i++) await T('touchMove', a[0] + (z[0] - a[0]) * i / 8, a[1] + (z[1] - a[1]) * i / 8);
  const s1 = await p.evaluate(() => scrollY); await T('touchEnd'); await p.waitForTimeout(400);
  const ph = await p.$eval('.word-big', e => e.textContent).catch(() => '');
  ok('multi-line drag selects phrase', ph.split(' ').length === 15, ph); ok('page did not scroll while selecting', s0 === s1, s0 + '→' + s1);
  await p.evaluate(() => document.querySelector('#wclose')?.click());
  // 普通滑动：不选词
  await p.waitForTimeout(800); const m = await c(20);
  await T('touchStart', m[0], m[1]); for (let i = 1; i <= 6; i++) { await T('touchMove', m[0], m[1] - i * 30); await p.waitForTimeout(16); } await T('touchEnd'); await p.waitForTimeout(400);
  ok('quick swipe does not open sheet', await p.$eval('#sheetWrap', e => e.hidden)); ok('no selection after swipe', (await p.$$eval('.prose .w.sel', x => x.length)) === 0);
  // 提示文字不拆出单字
  const lines = await p.$$eval('.hint.tips span', s => s.map(e => Math.round(e.getBoundingClientRect().height)));
  ok('hint items on single lines', lines.length === 2 && lines.every(h => h < 30), JSON.stringify(lines));
  await p.$eval('#sheetWrap', e => e.hidden) ; await p.evaluate(() => scrollTo(0, 0));
  ok('no page errors', !errs.length, errs.join('|'));
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();

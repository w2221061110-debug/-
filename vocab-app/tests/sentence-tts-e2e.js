// 整句朗读：真实请求百度/有道音频。URL=... node tests/sentence-tts-e2e.js
const { chromium, devices } = require('playwright');
const U = process.env.URL || 'http://localhost:8811/vocab-app/'; let fails = 0; const ok = (k, c, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', k, x); };
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const mk = async (block) => { const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }); if (block) await ctx.route(block, r => r.abort());
    await ctx.addInitScript(() => { window.__src = []; const op = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (!this.currentSrc.startsWith('data:')) __src.push(this.src); return op.apply(this, arguments); }; });
    const p = await ctx.newPage(); await p.goto(U); await p.waitForSelector('.hero'); return p; };
  const run = (p, t) => p.evaluate(async t => { __src = []; const r = await __app.speak(t); return { r, src: __src }; }, t);
  let p = await mk();
  let r = await run(p, 'government'); ok('single word youdao', r.r && r.src.length === 1 && /dictvoice\?audio=government/.test(r.src[0]), r.src);
  r = await run(p, 'look forward to'); ok('dict phrase youdao whole', r.r && r.src.length === 1 && /dictvoice/.test(r.src[0]), r.src);
  r = await run(p, 'that the negligence was a necessary condition'); ok('sentence baidu one clip', r.r && r.src.length === 1 && /fanyi\.baidu\.com\/gettts/.test(r.src[0]), r.src);
  await p.evaluate(() => __app.store.mem.kv.set('accent', { id: 'accent', v: 'uk' })); r = await run(p, 'in the circumstances of the case'); ok('uk accent baidu', /lan=uk/.test(r.src[0]), r.src[0]);
  await p.evaluate(() => __app.store.mem.kv.delete('accent'));
  const long = 'In determining whether a reasonable person would have taken precautions against a risk of harm, the court is to consider the following (amongst other relevant things): (a) The probability that the harm would occur if care were not taken, (b) The likely seriousness of the harm, (c) The burden of taking precautions to avoid the risk of harm, (d) The social utility of the activity that creates the risk of harm.';
  r = await run(p, long); ok('long text split <=300', r.r && r.src.length === 2 && r.src.every(s => decodeURIComponent(s.split('text=')[1]).length <= 300), r.src.length);
  // UI: 文章里长按拖选短语
  await p.evaluate(() => __app.importText('The court will consider the burden of taking precautions to avoid the risk of harm in every case before deciding.', 'prose')); await p.waitForSelector('.prose');
  const ws = await p.$$('.prose .w'); const a = await ws[3].boundingBox(), z = await ws[9].boundingBox(); const cdp = await p.context().newCDPSession(p);
  await p.evaluate(() => { __src = []; }); const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await T('touchStart', a.x + 5, a.y + 8); await p.waitForTimeout(500); for (let k = 1; k <= 6; k++) await T('touchMove', a.x + 5 + (z.x - a.x) * k / 6, a.y + 8 + (z.y - a.y) * k / 6); await T('touchEnd'); await p.waitForTimeout(2500);
  const s1 = await p.evaluate(() => __src); ok('drag-select phrase -> baidu whole', s1.length >= 1 && /baidu/.test(s1[0]) && /consider%20the%20burden/.test(s1[0]), s1);
  await p.context().close();
  // 百度不通 → 退回有道逐段
  p = await mk(/fanyi\.baidu\.com/); r = await run(p, 'I am looking forward to seeing you'); ok('baidu blocked -> youdao fallback', r.r && r.src.some(s => /baidu/.test(s)) && r.src.filter(s => /dictvoice/.test(s)).length >= 5, r.src.length);
  await p.context().close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await b.close(); })();

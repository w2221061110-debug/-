// URL=... node tests/feedback-e2e.js  —— 触屏真实事件（CDP）回归
const { chromium } = require('playwright');
const URL0 = process.env.URL || 'http://localhost:8798/vocab-app/index.html';
let fails = 0; const ok = (k, c, extra = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', k, extra); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [name, w, h] of [['phone', 390, 844], ['ipad', 820, 1180], ['desktop', 1024, 768]]) {
    const touch = name !== 'desktop';
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, acceptDownloads: true });
    await ctx.addInitScript(() => { HTMLMediaElement.prototype.play = function () { (window.__said ||= []).push(decodeURIComponent((this.src.match(/audio=([^&]*)/) || [])[1] || '')); setTimeout(() => this.dispatchEvent(new Event('ended')), 50); return Promise.resolve(); }; });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ' ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(name + ' ' + m.text()));
    const cdp = await ctx.newCDPSession(p);
    const tch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8 }] });
    await p.goto(URL0); await p.waitForSelector('.hero'); await p.evaluate(() => __app.store.setKV('engine', 'youdao'));
    const click = async sel => touch ? p.tap(sel) : p.click(sel);
    // 列表：第一次点就出释义 + 发音
    await p.evaluate(() => __app.importText('1. take advantage of\n2. give up\n3. look forward to\n4. take care of\n5. in charge of'));
    await p.waitForSelector('.unit'); await click('.unit >> nth=1'); await p.waitForSelector('.word-big', { timeout: 3000 }).catch(() => {});
    ok(name + ' first tap opens sheet', (await p.$eval('.word-big', e => e.textContent).catch(() => '')) === 'give up');
    ok(name + ' first tap speaks phrase', (await p.evaluate(() => window.__said || [])).includes('give up'));
    await p.waitForTimeout(500);
    ok(name + ' phrase phonetics shown', !!(await p.$eval('#wph', e => !e.hidden && e.textContent.length > 3)), await p.$eval('#wph', e => e.textContent));
    ok(name + ' give up cn', (await p.$eval('#wcn', e => e.textContent)) === '放弃');
    // 释义打开时点别的条目 → 切换
    await click('.unit >> nth=2'); await p.waitForTimeout(400);
    ok(name + ' tap other row switches sheet', (await p.$eval('.word-big', e => e.textContent)) === 'look forward to');
    ok(name + ' look forward to = 期待，盼望', (await p.$eval('#wcn', e => e.textContent)) === '期待，盼望');
    await click('.unit >> nth=3'); await p.waitForTimeout(400); ok(name + ' take care of has 照顾', /照顾/.test(await p.$eval('#wcn', e => e.textContent)));
    await p.screenshot({ path: `shots/fb-${name}-sheet-nonmodal.png` });
    await click('#wclose'); ok(name + ' close button', await p.$eval('#sheetWrap', e => e.hidden));
    // 文章长按拖选 take advantage of（真实触摸，多种落点）
    if (touch) {
      await p.evaluate(() => __app.importText('Students should take advantage of every chance to practise speaking.\nTeachers often remind them that mistakes are part of learning.'));
      await p.waitForSelector('.prose');
      let good = 0; const N = 12; const got = [];
      for (let k = 0; k < N; k++) {
        const r = await p.$$eval('.prose .w', ws => ws.slice(2, 5).map(w => { const b = w.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }));
        const [s, , e] = r; const jitter = (k % 4) * 3; // 落点：词内/词尾/越过词尾/词间空格
        const ex = [e[2] - 2, e[2] + 4, e[2] + 9, (e[0] + e[2]) / 2][k % 4], ey = (e[1] + e[3]) / 2 + (k % 3 - 1) * 6;
        await tch('touchStart', s[0] + 6, (s[1] + s[3]) / 2); await p.waitForTimeout(460);
        const steps = 6; for (let i = 1; i <= steps; i++) await tch('touchMove', s[0] + 6 + (ex - s[0] - 6) * i / steps, (s[1] + s[3]) / 2 + (ey - (s[1] + s[3]) / 2) * i / steps);
        await tch('touchEnd'); await p.waitForTimeout(250);
        const ph = await p.$eval('.word-big', e => e.textContent).catch(() => ''); got.push(ph); if (ph === 'take advantage of') good++;
        await p.evaluate(() => document.querySelector('#wclose')?.click()); await p.waitForTimeout(100);
      }
      ok(name + ` long-press select 'take advantage of' ${good}/${N}`, good === N, JSON.stringify([...new Set(got)]));
      // 普通点一下文章里的词
      const box = await p.$$eval('.prose .w', ws => { const b = ws[8].getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, ws[8].textContent]; });
      await tch('touchStart', box[0], box[1]); await tch('touchEnd'); await p.waitForTimeout(400);
      ok(name + ' prose single tap opens sheet', (await p.$eval('.word-big', e => e.textContent).catch(() => '')) === box[2]);
      // 页面可滚动（在正文上滑动）
      await p.evaluate(() => document.querySelector('#wclose')?.click());
    }
    // 导出文件名用本地日期
    await p.goto(URL0); await p.waitForSelector('.hero'); await click('[data-tab=settings]');
    const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null); await click('#exp'); const d = await dl;
    const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    ok(name + ' export filename local date', d && d.suggestedFilename() === `拾词备份-${today}.json`, d && d.suggestedFilename());
    // 导入提示分开计数
    if (d) { const f = `/tmp/fb-${name}.json`; await d.saveAs(f); await p.evaluate(() => __app.store.clearAll()); await p.reload(); await p.waitForSelector('.hero'); await click('[data-tab=settings]');
      await p.setInputFiles('#fileJson', f); await p.waitForTimeout(600); const tt = await p.$eval('#toast', e => e.textContent); ok(name + ' import toast words/pages', /单词新增 \d+.*页面新增 \d+/.test(tt), tt); }
    // 徽章 = 复习页
    await click('[data-tab=review]'); await p.waitForTimeout(300);
    const badge = await p.$eval('#badge', e => e.hidden ? 0 : +e.textContent); const st = await p.$eval('#start', e => e.textContent);
    ok(name + ' badge matches review page', st.includes(String(badge)) || (badge === 0 && /没有/.test(st)), `badge=${badge} "${st}"`);
    // 清空：应用内确认
    await click('[data-tab=settings]'); await click('#clr'); await p.waitForSelector('#cfm');
    ok(name + ' clear button disabled until typed', await p.$eval('#cfy', e => e.disabled));
    await p.fill('#cfm', '清空'); await click('#cfy'); await p.waitForTimeout(500);
    ok(name + ' clear all works', (await p.evaluate(() => __app.mem.items.size + __app.mem.pages.size)) === 0);
    await p.reload(); await p.waitForSelector('.hero'); ok(name + ' still empty after reload', (await p.evaluate(() => __app.mem.items.size)) === 0);
    await ctx.close();
  }
  ok('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();

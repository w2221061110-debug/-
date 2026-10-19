// 长按起点放宽 + 释义面板首次打开不遮导航。URL=... node tests/edge-e2e.js
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();let bad=0;
for(const [w,h,t] of [[548,900,true],[390,844,true],[820,1180,true],[1440,900,false]]){const c=await b.newContext({viewport:{width:w,height:h},hasTouch:t,isMobile:t});const p=await c.newPage();
await p.goto((process.env.URL||'http://localhost:8800/vocab-app/index.html'));await p.waitForSelector('.hero');
await p.evaluate(()=>__app.importText('1. look forward to\n2. take care of'));await p.waitForSelector('.unit');
// 首次打开：逐帧检查面板是否盖住导航
await p.evaluate(()=>{window.__ov=0;const tabs=document.getElementById('tabs');const chk=()=>{const s=document.getElementById('sheet');if(!document.getElementById('sheetWrap').hidden){const a=s.getBoundingClientRect(),b=tabs.getBoundingClientRect();if(a.bottom>b.top+1&&a.right>b.left&&a.left<b.right)__ov++;}if(performance.now()<__end)requestAnimationFrame(chk)};window.__end=performance.now()+1500;requestAnimationFrame(chk)});
await (t?p.tap('.unit >> nth=0'):p.click('.unit >> nth=0'));await p.waitForTimeout(1600);const ov=await p.evaluate(()=>__ov);if(ov)bad++;console.log(w,'frames sheet overlapping nav:',ov);
if(w===548)await p.screenshot({path:'shots/edge-548.png'});
// 左边缘起按
if(t){await p.evaluate(()=>document.getElementById('wclose').click());await p.evaluate(()=>__app.importText('We will be there soon.\nlook forward to seeing you and we take care of everything for the trip.'));await p.waitForSelector('.prose');
const cdp=await c.newCDPSession(p);const T=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,radiusX:6,radiusY:6}]});
let good=0;for(const off of [-8,-4,-1,0,1]){const r=await p.$$eval('.prose .w',ws=>[5,6,7].map(i=>{const b=ws[i].getBoundingClientRect();return[b.left,b.top,b.right,b.bottom]}));
await T('touchStart',r[0][0]+off,(r[0][1]+r[0][3])/2);await p.waitForTimeout(460);for(let i=1;i<=5;i++)await T('touchMove',r[0][0]+(r[2][2]-4-r[0][0])*i/5,(r[0][1]+r[0][3])/2);await T('touchEnd');await p.waitForTimeout(250);
const ph=await p.$eval('.word-big',e=>e.textContent).catch(()=>'');if(ph==='look forward to')good++;else console.log(' got',off,ph);await p.evaluate(()=>document.getElementById('wclose')?.click());}
if(good<5)bad++;console.log(w,'left-edge long-press',good+'/5');}
await c.close();}
await b.close();console.log(bad?'FAIL':'ALL PASS')})();

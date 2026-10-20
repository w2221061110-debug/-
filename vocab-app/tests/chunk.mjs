// 长句切段：每段 ≤3 词；NET=1 时逐段请求有道，统计返回 audio/mpeg 的比例
globalThis.Audio = class { setAttribute() {} play() { return Promise.resolve(); } pause() {} };
globalThis.addEventListener = () => {}; globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
const { chunkText } = await import('../js/speak.js');
let fails = 0; const ok = (k, c, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', k, x); };
const S = "Some mental health issues such as anxiety and depression. Besides, McCabe also stated that the complete picture of students' ability, which lack of updated skills to prepare for future work.";
const parts = chunkText(S);
ok('every chunk ≤3 words', parts.every(p => p.t.split(' ').length <= 3), JSON.stringify(parts.map(p => p.t)));
ok('no words lost', parts.map(p => p.t).join(' ').split(' ').length === S.replace(/[.,]/g, '').split(/\s+/).length);
ok('short phrase kept whole', chunkText('look forward to').length === 1 && chunkText('look forward to')[0].t === 'look forward to');
ok('single word', chunkText('hello')[0].t === 'hello' && !chunkText('hello')[0].words);
if (process.env.NET) {
  const all = [...new Set(parts.flatMap(p => p.words ? [p.t, ...p.words] : [p.t]))]; let good = 0, wordsBad = [];
  for (const t of all) { const r = await fetch(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(t)}&type=2`); const ty = r.headers.get('content-type') || ''; const a = r.status === 200 && ty.includes('audio/mpeg'); if (a) good++; else if (!t.includes(' ')) wordsBad.push(t); console.log(r.status, ty, t); }
  ok('every single word returns audio/mpeg', !wordsBad.length, wordsBad.join(','));
  // 整句本身确实 500（问题根因）
  const r = await fetch(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(S)}&type=2`); ok('whole sentence is rejected by youdao (root cause)', r.status !== 200, r.status);
}
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);

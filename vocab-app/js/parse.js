// 文本 -> 学习单元。纯函数，可在 node 中测试。
const NUM = /^\s*(?:\(?\d{1,3}\s*[\.\)、:：]|\(\d{1,3}\)|[①-⑳]|[a-hA-H][\.\)](?=\s))\s*/;
const BUL = /^\s*[•·▪●○◦■□\-–—*>]\s+/;
const CJK = /[\u3400-\u9fff\uff08\uff09]/;
const POS = /\b(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|phr|abbr)\.(?=\s|$|[\u3400-\u9fff])/;

export function cleanEnglish(s) {
  let t = s;
  const c = t.search(CJK); if (c >= 0) t = t.slice(0, c);
  const p = t.search(POS); if (p > 0) t = t.slice(0, p);
  t = t.replace(/\[[^\]]*\]|\/[^\/]*\//g, ' ');          // 音标
  t = t.replace(/[|_~`"“”«»]/g, ' ').replace(/\s*[=:：—–]\s*$/, '');
  t = t.replace(/^[^A-Za-z]+|[^A-Za-z.'?!)]+$/g, '').replace(/[.,;:]+$/, '');
  return t.replace(/\s+/g, ' ').trim();
}

// 一行里塞了多个编号：1. a b 2. c d
function splitInlineNumbers(line) {
  const parts = line.split(/\s(?=\(?\d{1,2}\s*[\.\)、]\s*[A-Za-z])/);
  return parts.length > 1 && parts.every(p => NUM.test(p)) ? parts : [line];
}

export function tokenizeWords(text) {
  return (text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []);
}

/** 返回 {mode:'list'|'prose', units:[{text,num?}], lines?} */
export function parseText(raw) {
  const lines0 = String(raw || '').replace(/\r/g, '').split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim()).filter(l => /[A-Za-z]/.test(l));
  if (!lines0.length) return { mode: 'list', units: [] };
  const lines = lines0.flatMap(splitInlineNumbers);
  const marked = lines.filter(l => NUM.test(l) || BUL.test(l)).length;
  const entryLike = l => {
    const e = cleanEnglish(l.replace(NUM, '').replace(BUL, ''));
    const n = tokenizeWords(e).length;
    const e2 = e.replace(/\b(?:sth|sb|sp|etc|e\.g|i\.e|one's)\.?/gi, '');
    return n >= 1 && n <= 5 && !/[.!?]["']?$/.test(e2) && !/[,;]\s|\.\s+[A-Z]/.test(e2);
  };
  const entries = lines.filter(entryLike).length;
  const avgWords = lines.reduce((a, l) => a + tokenizeWords(l).length, 0) / lines.length;
  const lowerStarts = lines.slice(1).filter(l => /^[a-z]/.test(l)).length / Math.max(1, lines.length - 1);
  const proseLike = marked / lines.length < 0.5 && (avgWords > 5.5 || (lowerStarts > 0.4 && avgWords > 3.5));
  const isList = marked / lines.length >= 0.5 || (!proseLike && entries / lines.length >= 0.7);
  if (isList) {
    const units = []; const seen = new Set();
    const strongNum = lines.filter(l => NUM.test(l)).length / lines.length >= 0.6;
    for (const l of lines) {
      if (strongNum && !NUM.test(l) && !BUL.test(l)) continue; // 编号列表里的标题行
      const m = l.match(NUM); const num = m ? m[0].replace(/[^\d①-⑳A-Za-z]/g, '') : null;
      let body = l.replace(NUM, '').replace(BUL, '');
      // 编号行若是长句，仍作为整体朗读单元
      let en = cleanEnglish(body);
      if (!en || !/[A-Za-z]{2,}|^[AaI]$/.test(en)) continue;
      const key = en.toLowerCase();
      if (seen.has(key)) continue; seen.add(key);
      units.push({ text: en, num });
    }
    return { mode: 'list', units };
  }
  // 散文：保留原文段落，单词可点
  const text = lines0.join('\n');
  const uniq = []; const seen = new Set();
  for (const w of tokenizeWords(text)) { const k = w.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push({ text: w }); } }
  return { mode: 'prose', text, units: uniq };
}

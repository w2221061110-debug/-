// SM-2 变体。grade: 0 忘了 / 3 模糊 / 4 记得 / 5 很熟
export const DAY = 86400000;
export function newSrs() { return { reps: 0, ease: 2.5, interval: 0, due: 0, lapses: 0, last: 0 }; }
export function review(s0, grade, now = Date.now()) {
  const s = { ...(s0 || newSrs()) };
  if (grade < 3) {
    s.reps = 0; s.lapses++; s.interval = 0; s.due = now + 10 * 60000; // 10 分钟后再来
  } else {
    if (s.reps === 0) s.interval = grade === 5 ? 3 : 1;
    else if (s.reps === 1) s.interval = grade === 5 ? 7 : grade === 3 ? 2 : 4;
    else s.interval = Math.round(s.interval * s.ease * (grade === 3 ? 0.6 : grade === 5 ? 1.3 : 1));
    s.interval = Math.max(1, Math.min(s.interval, 365));
    s.reps++;
    const d = new Date(now); d.setHours(4, 0, 0, 0); // 以凌晨4点为一天起点
    s.due = d.getTime() + s.interval * DAY;
  }
  s.ease = Math.max(1.3, s.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  s.last = now;
  return s;
}
export function isDue(s, now = Date.now()) { return !!s && s.reps + s.lapses > 0 && s.due <= now; }
export function isNew(s) { return !s || (s.reps === 0 && s.lapses === 0); }
export function preview(s, now = Date.now()) {
  const out = {};
  for (const g of [0, 3, 4, 5]) { const r = review(s, g, now); out[g] = r.due - now; }
  return out;
}
export function fmtDur(ms) {
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + '分钟';
  if (ms < DAY) return Math.round(ms / 3600000) + '小时';
  const d = Math.round(ms / DAY); return d < 30 ? d + '天' : d < 365 ? Math.round(d / 30) + '个月' : '1年';
}

/** 一天从凌晨 4 点开始 */
export function dayStart(now = Date.now()) { const d = new Date(now); if (d.getHours() < 4) d.setDate(d.getDate() - 1); d.setHours(4, 0, 0, 0); return d.getTime(); }
/** 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC） */
export function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
/** 徽章 = 复习页「开始复习 N 个」= 到期复习 + 今天还能学的新词（新词上限扣掉今天已学的） */
export function queueCounts(list, newPerDay = 20, now = Date.now()) {
  const due = list.filter(i => isDue(i.srs, now)).length;
  const fresh = list.filter(i => isNew(i.srs)).length;
  const t = dayStart(now); const learned = list.filter(i => i.srs && i.srs.firstAt >= t).length;
  const nw = Math.min(fresh, Math.max(0, newPerDay - learned));
  return { due, nw, total: due + nw, learnedToday: learned };
}

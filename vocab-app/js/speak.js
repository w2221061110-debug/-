// 发音：有道真人/合成音频（国内可用）优先，系统语音回退；短语整体朗读。
import { getKV } from './store.js';
// iPhone 静音开关会让系统语音(speechSynthesis)没声；<audio> 媒体播放不受静音开关影响，所以有网时先用有道音频
const audio = new Audio(); audio.preload = 'auto'; audio.setAttribute('playsinline', ''); audio.setAttribute('webkit-playsinline', '');
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
// 第一次手势时用一段静音解锁 audio，之后异步回退/重播也能出声
const SILENT = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAAAAAAAAAAAAAAA';
let unlocked = false;
function unlock() { if (unlocked) return; unlocked = true; try { if (!audio.src) { audio.src = SILENT; const p = audio.play(); p?.catch?.(() => {}); } } catch {} }
addEventListener('touchend', unlock, { once: true, capture: true }); addEventListener('click', unlock, { once: true, capture: true });
let voices = []; let generation = 0, cancelAudio;
function loadVoices() { voices = (window.speechSynthesis?.getVoices?.() || []).filter(v => /^en/i.test(v.lang)); }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
export function englishVoices() { loadVoices(); return voices; }
export const stats = { youdao: 0, system: 0, errors: 0 };
function pickVoice(accent) {
  const name = getKV('voice', '');
  return voices.find(v => v.name === name) || voices.find(v => v.lang.replace('_', '-') === (accent === 'uk' ? 'en-GB' : 'en-US') && /Samantha|Daniel|Karen|Google|Natural|Enhanced|Premium/i.test(v.name)) || voices.find(v => v.lang.replace('_', '-') === (accent === 'uk' ? 'en-GB' : 'en-US')) || voices[0];
}
function speakSystem(text, rate) {
  return new Promise((res, rej) => {
    if (!('speechSynthesis' in window)) return rej(new Error('no tts'));
    loadVoices(); speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); const v = pickVoice(getKV('accent', 'us'));
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = getKV('accent', 'us') === 'uk' ? 'en-GB' : 'en-US';
    u.rate = rate; u.onend = res; u.onerror = e => (e.error === 'interrupted' || e.error === 'canceled') ? res() : rej(e);
    stats.system++; speechSynthesis.speak(u);
  });
}
const yUrl = t => `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(t)}&type=${getKV('accent', 'us') === 'uk' ? 1 : 2}`;
// 有道 dictvoice 只认词典里有的词/常见短语，任意整句会返回 500（JSON "returned null audio"）。
// 所以长句先按标点切段：≤3 词的段整段试，失败或更长的段逐词播；读不出的词（如 OCR 错字）跳过。
export function chunkText(text) {
  const segs = text.split(/[.,;:!?，。；：！？()\[\]"“”]+|\s[-–—]\s/).map(x => x.trim().split(/\s+/).filter(Boolean)).filter(x => x.length);
  const out = [];
  for (const ws of segs) { if (ws.length <= 3) out.push({ t: ws.join(' '), words: ws.length > 1 ? ws : null }); else ws.forEach(w => out.push({ t: w, words: null })); }
  return out;
}
function prefetch(t) { try { fetch(yUrl(t), { mode: 'no-cors' }).catch(() => {}); } catch {} }
function playOne(t, rate, token) {
  return new Promise((res, rej) => {
    let timer, settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); audio.onended = audio.onerror = null; cancelAudio = null; error ? rej(error) : res(); };
    cancelAudio = () => finish(new Error('canceled'));
    audio.onended = () => finish(); audio.onerror = () => finish(new Error('audio'));
    audio.src = yUrl(t); audio.playbackRate = rate; audio.defaultPlaybackRate = rate;
    const p = audio.play(); if (p) p.catch(e => finish(e));
    // 没开始播放就算卡住；开始播放后不限时
    timer = setTimeout(() => { if (audio.currentTime === 0) { audio.pause(); finish(new Error('stall')); } }, 8000);
  });
}
async function speakYoudao(text, rate) {
  const token = generation; stats.youdao++;
  const parts = chunkText(text); if (!parts.length) throw new Error('empty');
  if (parts.length === 1 && !parts[0].words) return playOne(parts[0].t, rate, token);
  let played = 0, lastErr;
  for (let k = 0; k < parts.length; k++) {
    if (token !== generation) return;
    if (parts[k + 1]) prefetch(parts[k + 1].t);
    try { await playOne(parts[k].t, rate, token); played++; continue; } catch (e) { if (e.message === 'canceled') return; lastErr = e; }
    if (parts[k].words) for (const w of parts[k].words) { if (token !== generation) return; try { await playOne(w, rate, token); played++; } catch (e) { if (e.message === 'canceled') return; lastErr = e; } }
  }
  if (!played) throw lastErr || new Error('audio');
}
export function stop() { generation++; cancelAudio?.(); try { audio.pause(); window.speechSynthesis?.cancel(); } catch {} }
/** 必须在用户手势里调用（iOS 要求） */
export async function speak(text, { slow = false } = {}) {
  stop();
  const token = generation;
  const rate = (getKV('rate', 1)) * (slow ? 0.7 : 1);
  const engine = getKV('engine', 'auto');
  const order = engine === 'system' ? [speakSystem, speakYoudao] : engine === 'youdao' ? [speakYoudao, speakSystem] : (navigator.onLine === false ? [speakSystem, speakYoudao] : [speakYoudao, speakSystem]);
  for (const f of order) { if (token !== generation) return false; try { await f(text, rate); return true; } catch (e) { stats.errors++; } }
  if (token === generation) window.dispatchEvent(new Event('vocab-speech-error'));
  return false;
}

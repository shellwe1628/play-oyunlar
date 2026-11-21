// The director page: one HTML page that draws frame i of the promo at 1080×1920 — the recorded
// clip frames (full bleed, slow push-in), transitions (whip pan, zoom punch, flash, zoom-through),
// trauma shake on impacts, kinetic captions and the end card with the coming-soon
// leaderboard. `window.render(i)` sets everything for frame i deterministically (no clocks); the
// renderer screenshots it. Motion follows the game-feel rules: back-out pops, ease-out settles,
// trauma² shake from summed sines, short flashes (never more than ~3 a second).
import { readFileSync } from 'node:fs';
import { FONT_CSS } from '../../lib/render.mjs';

const CSS = (p) => `
${FONT_CSS}
:root{--bg1:${p.bg1};--bg2:${p.bg2};--accent:${p.accent};--hot:${p.hot};--ink:${p.ink};--text:${p.text};--glow:${p.glow}}
html,body{margin:0;padding:0;width:1080px;height:1920px;overflow:hidden;background:var(--bg2)}
*{box-sizing:border-box}
body{font-family:'Nunito',sans-serif;font-weight:900;color:var(--text)}
#bg{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 30%,var(--bg1),var(--bg2))}
#cam{position:absolute;inset:0;transform-origin:540px 960px}
.layer{position:absolute;inset:0;overflow:hidden;will-change:transform}
.layer img{position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover}
#vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 62% at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%);opacity:0}
.bar{position:absolute;left:0;right:0;height:120px;background:#000;transform:scaleY(0)}
#barT{top:0;transform-origin:top}#barB{bottom:0;transform-origin:bottom}
#streaks{position:absolute;inset:0;opacity:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,0) 0 38px,rgba(255,255,255,.55) 38px 41px,rgba(255,255,255,0) 41px 90px);filter:blur(1px)}
#flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.scrim{position:absolute;left:0;right:0;height:760px;opacity:0}
#scrimB{bottom:0;background:linear-gradient(to top,rgba(0,0,0,.62) 0,rgba(0,0,0,.42) 45%,rgba(0,0,0,0) 100%)}
#scrimT{top:0;background:linear-gradient(to bottom,rgba(0,0,0,.62) 0,rgba(0,0,0,.42) 45%,rgba(0,0,0,0) 100%)}
#capbox{position:absolute;border-radius:44px;background:rgba(0,0,0,.46);box-shadow:inset 0 0 0 5px rgba(255,255,255,.14);transform-origin:50% 50%}
#cap{position:absolute;left:60px;right:60px;text-align:center;line-height:1.08;letter-spacing:-1px}
.w{display:inline-block;white-space:pre;-webkit-text-stroke:16px var(--ink);paint-order:stroke fill;text-shadow:0 10px 0 rgba(0,0,0,.35);transform-origin:50% 70%}
.w.hi{color:var(--accent)}
#kick{position:absolute;left:50%;padding:14px 34px 16px;border-radius:999px;background:var(--hot);color:#fff;font-size:44px;letter-spacing:2px;text-transform:uppercase;white-space:nowrap;box-shadow:0 8px 0 rgba(0,0,0,.28);-webkit-text-stroke:0;transform-origin:50% 50%}
#tag{display:none;position:absolute;left:44px;top:236px;display:flex;align-items:center;gap:16px;padding:10px 26px 10px 10px;border-radius:999px;background:rgba(0,0,0,.42);font-size:36px;opacity:0}
#tag img{width:64px;height:64px;border-radius:16px}
#end{position:absolute;inset:0;opacity:0;overflow:hidden}
#end .bg{position:absolute;inset:-200px;background:radial-gradient(70% 50% at 50% 38%,var(--bg1),var(--bg2))}
#rays{position:absolute;left:540px;top:720px;width:3000px;height:3000px;margin:-1500px;background:repeating-conic-gradient(rgba(255,255,255,.10) 0 9deg,rgba(255,255,255,0) 9deg 22.5deg);border-radius:50%}
#icon{position:absolute;left:540px;top:520px;width:380px;height:380px;margin:-190px;border-radius:84px;box-shadow:0 26px 0 rgba(0,0,0,.25),0 0 120px var(--glow);overflow:hidden}
#icon img{width:100%;height:100%}
#name{position:absolute;left:40px;right:40px;top:770px;text-align:center;font-size:112px;line-height:1.02}
#soon{position:absolute;left:90px;right:90px;top:1060px;height:500px;border-radius:48px;background:rgba(0,0,0,.34);box-shadow:inset 0 0 0 6px rgba(255,255,255,.18)}
.pod{position:absolute;bottom:150px;width:150px;border-radius:22px 22px 8px 8px;box-shadow:inset 0 -14px 0 rgba(0,0,0,.18);transform-origin:bottom;display:flex;align-items:flex-start;justify-content:center;padding-top:14px;font-size:64px;color:rgba(255,255,255,.95);-webkit-text-stroke:10px rgba(0,0,0,.35);paint-order:stroke fill}
#cup{position:absolute;left:50%;top:-34px;width:170px;height:170px;margin-left:-85px;transform-origin:50% 100%}
#soonText{position:absolute;left:20px;right:20px;bottom:28px;text-align:center;font-size:62px;line-height:1.05}
#soonSub{position:absolute;left:40px;right:40px;top:1572px;text-align:center;font-size:44px;color:rgba(255,255,255,.92);font-weight:800}
#stamp{position:absolute;right:46px;top:1010px;padding:12px 30px;border:8px solid var(--hot);border-radius:20px;color:var(--hot);background:rgba(255,255,255,.95);font-size:54px;letter-spacing:3px;transform-origin:50% 50%;box-shadow:0 10px 0 rgba(0,0,0,.25)}
.conf{position:absolute;width:22px;height:34px;border-radius:5px}
.stroke{-webkit-text-stroke:16px var(--ink);paint-order:stroke fill;text-shadow:0 10px 0 rgba(0,0,0,.35)}
`;

const JS = `
const D = window.DATA;
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  outCubic: (x) => 1 - (1 - x) ** 3,
  inCubic: (x) => x ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x, s = 1.9) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outQuint: (x) => 1 - (1 - x) ** 5,
};
const prog = (t, a, d) => clamp((t - a) / d);

// ---- images: one img per layer slot, decoded before the screenshot
const layers = [0, 1].map((k) => {
  const div = document.createElement('div');
  div.className = 'layer';
  const img = new Image();
  div.appendChild(img);
  $('cam').insertBefore(div, $('vig'));
  return { div, img, src: '' };
});
async function setImg(L, src) {
  if (!src) { L.div.style.display = 'none'; return; }
  L.div.style.display = '';
  if (L.src === src) return;
  L.src = src;
  L.img.src = src;
  try { await L.img.decode(); } catch (e) { /* drawn anyway */ }
}

// ---- captions: words as spans, *x* = highlighted
function words(el, text, size) {
  el.innerHTML = '';
  el.style.fontSize = size + 'px';
  const out = [];
  let hi = false;
  for (const part of text.split(/(\\*)/)) {
    if (part === '*') { hi = !hi; continue; }
    for (const w of part.split(/(\\s+)/)) {
      if (!w) continue;
      if (/^\\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); continue; }
      const s = document.createElement('span');
      s.className = 'w' + (hi ? ' hi' : '');
      s.textContent = w;
      el.appendChild(s);
      out.push(s);
    }
  }
  return out;
}
let capKey = null, capWords = [], kickKey = null;
function fitCaption(el, text) {
  let size = text.replace(/\\*/g, '').length > 22 ? 84 : 100;
  for (;;) {
    capWords = words(el, text, size);
    const lines = Math.round(el.scrollHeight / (size * 1.08));
    if ((lines <= 2 && el.scrollWidth <= el.clientWidth + 2) || size <= 60) break;
    size -= 4;
  }
  return size;
}

function speedAt(sp, tau) {
  if (typeof sp === 'number') return sp;
  if (tau <= sp[0][0]) return sp[0][1];
  for (let i = 1; i < sp.length; i++) if (tau <= sp[i][0]) { const [a, va] = sp[i - 1], [b, vb] = sp[i]; return lerp(va, vb, (tau - a) / (b - a)); }
  return sp[sp.length - 1][1];
}

function shakeAt(t) {
  let trauma = 0;
  for (const s of D.shakes) { if (t >= s.t && t < s.t + 1.2) trauma += Math.max(0, s.amp - 1.6 * (t - s.t)); }
  trauma = clamp(trauma);
  const k = trauma * trauma;
  const u = t * 30;
  return { x: 26 * k * Math.sin(u * 1.7) + 9 * k * Math.sin(u * 4.1), y: 20 * k * Math.sin(u * 2.3 + 1) + 7 * k * Math.sin(u * 3.7), r: 0.03 * k * Math.sin(u * 1.1) };
}

function beatAt(t) {
  let b = D.beats.length - 1;
  for (let i = 0; i < D.beats.length; i++) if (t < D.beats[i].start + D.beats[i].dur) { b = i; break; }
  return b;
}

function layerStyle(L, o) {
  const tr = 'translate(' + (o.x || 0) + 'px,' + (o.y || 0) + 'px) rotate(' + (o.rot || 0) + 'rad) scale(' + (o.s || 1) + ')';
  L.div.style.transformOrigin = (o.ox ?? 540) + 'px ' + (o.oy ?? 960) + 'px';
  L.div.style.transform = tr;
  L.div.style.filter = (o.blur ? 'blur(' + o.blur.toFixed(1) + 'px) ' : '') + (o.bright && o.bright !== 1 ? 'brightness(' + o.bright.toFixed(2) + ')' : '');
  L.div.style.opacity = o.op ?? 1;
  L.div.style.zIndex = o.z ?? 1;
}

function kenBurns(beat, tau) {
  const z = beat.zoom || [1.04, 1.12];
  const k = E.inOutSine(clamp(tau / beat.dur));
  return { s: lerp(z[0], z[1], k), ox: (beat.focus ? beat.focus[0] : 0.5) * 1080, oy: (beat.focus ? beat.focus[1] : 0.5) * 1920 };
}

const TD = 0.32;
function drawGameplay(i, t) {
  const bi = beatAt(t);
  const beat = D.beats[bi];
  const tau = t - beat.start;
  const fr = D.frames[i];
  const cur = { ...kenBurns(beat, tau), z: 2 };
  let out = null;
  const prev = bi > 0 ? D.beats[bi - 1] : null;
  let flash = 0, streak = 0;
  if (prev && tau < TD && fr[1]) {
    const p = tau / TD;
    out = { ...kenBurns(prev, prev.dur + tau), z: 1 };
    const kind = beat.trans || 'whip';
    if (kind === 'whip') {
      const q = E.inOutCubic(p);
      const dir = beat.dir || 1;
      out.x = -dir * q * 1180; cur.x = dir * (1 - q) * 1180;
      const bl = Math.sin(Math.PI * p) * 34;
      out.blur = bl; cur.blur = bl;
      streak = Math.sin(Math.PI * p) * 0.9;
    } else if (kind === 'punch') {
      const q = E.outBack(p, 2.4);
      cur.s *= 1 + 0.42 * (1 - q);
      cur.rot = (1 - E.outCubic(p)) * -0.06;
      cur.bright = 1 + 0.9 * (1 - p) ** 2;
      out.op = p < 0.18 ? 1 : 0;
      flash = 0.65 * (1 - p) ** 2;
    } else if (kind === 'flash') {
      out.op = 0;
      flash = 0.95 * (1 - p) ** 1.6;
      cur.s *= 1 + 0.08 * (1 - E.outCubic(p));
    } else if (kind === 'zoom') {
      const q = E.inCubic(p);
      out.s *= 1 + 1.1 * q; out.blur = 26 * q; out.op = 1 - q; out.z = 3;
      cur.s *= 0.86 + 0.14 * E.outCubic(p);
    } else if (kind === 'cut') { out.op = 0; }
  }
  // slow-motion look: letterbox + vignette + a little extra zoom while the clip is slowed
  const sp = speedAt(beat.speed ?? 1, tau);
  const slow = clamp((1 - sp) / 0.6);
  cur.s *= 1 + 0.05 * slow;
  $('vig').style.opacity = (0.15 + 0.6 * slow).toFixed(2);
  $('barT').style.transform = 'scaleY(' + (0.9 * slow).toFixed(3) + ')';
  $('barB').style.transform = 'scaleY(' + (0.9 * slow).toFixed(3) + ')';
  for (const f of D.flashes) if (t >= f.t && t < f.t + 0.25) flash = Math.max(flash, f.a * (1 - (t - f.t) / 0.25) ** 2);
  $('flash').style.opacity = flash.toFixed(3);
  $('streaks').style.opacity = streak.toFixed(3);
  return { bi, beat, tau, cur, out, fr };
}

function drawCaption(t) {
  const g = D.captions.find((c) => t >= c.start && t < c.end) || null;
  const cap = $('cap');
  const sT = $('scrimT'), sB = $('scrimB');
  const box = $('capbox');
  if (!g) { cap.style.display = 'none'; box.style.display = 'none'; $('kick').style.display = 'none'; sT.style.opacity = 0; sB.style.opacity = 0; return; }
  box.style.display = '';
  cap.style.display = '';
  if (capKey !== g.key) { capKey = g.key; cap.style.top = '0px'; fitCaption(cap, g.text); }
  const local = t - g.start;
  const exitAt = g.end - g.start - (g.last ? 0 : 0.2);
  const h = cap.offsetHeight;
  const cy = g.y ?? (g.pos === 'top' ? 470 : 1440);
  cap.style.top = (cy - h / 2) + 'px';
  let minL = 1e9, maxR = -1e9;
  for (const w of capWords) { minL = Math.min(minL, w.offsetLeft); maxR = Math.max(maxR, w.offsetLeft + w.offsetWidth); }
  const bw = Math.min(1040, maxR - minL + 90), bh = h + 50;
  box.style.left = (540 - bw / 2) + 'px'; box.style.width = bw + 'px'; box.style.top = (cy - bh / 2) + 'px'; box.style.height = bh + 'px';
  const ba = E.outBack(prog(local, 0, 0.3), 1.6);
  const be = g.last ? 0 : prog(local, exitAt, 0.2);
  box.style.transform = 'scale(' + Math.max(0, ba * (1 - 0.1 * be)).toFixed(3) + ',' + Math.max(0, ba * (1 - be)).toFixed(3) + ')';
  box.style.opacity = (1 - be).toFixed(3);
  const vis = clamp(local / 0.2) * (g.last ? 1 : clamp((g.end - t) / 0.2));
  (g.pos === 'top' ? sT : sB).style.opacity = (0.5 * vis).toFixed(3);
  (g.pos === 'top' ? sB : sT).style.opacity = 0;
  capWords.forEach((w, k) => {
    const a = prog(local, 0.06 + k * 0.075, 0.38);
    const s = E.outBack(a, 1.8);
    let tr = 'translateY(' + ((1 - E.outCubic(a)) * 70).toFixed(1) + 'px) rotate(' + ((1 - E.outCubic(a)) * (k % 2 ? 9 : -9)).toFixed(2) + 'deg) scale(' + Math.max(0, s).toFixed(3) + ')';
    if (w.classList.contains('hi') && a >= 1) tr += ' rotate(' + (Math.sin((local - k * 0.1) * 7) * 2.2).toFixed(2) + 'deg) scale(' + (1 + 0.035 * Math.sin(local * 9)).toFixed(3) + ')';
    let op = a > 0 ? 1 : 0;
    if (!g.last && local > exitAt) {
      const e = prog(local, exitAt, 0.2);
      tr = 'translateY(' + (-60 * E.inCubic(e)).toFixed(1) + 'px) scale(' + (1 + 0.15 * e).toFixed(3) + ')';
      op = 1 - e;
    }
    w.style.transform = tr;
    w.style.opacity = op;
  });
  // kicker pill over the caption
  const kk = $('kick');
  const kc = D.kickers.find((c) => t >= c.start && t < c.end) || null;
  if (!kc) { kk.style.display = 'none'; return; }
  kk.style.display = '';
  if (kickKey !== kc.key) { kickKey = kc.key; kk.textContent = kc.text; }
  const kl = t - kc.start;
  const a = E.outElastic(prog(kl, 0, 0.7));
  const e = kc.last ? 0 : prog(t, kc.end - 0.18, 0.18);
  kk.style.top = (cy - h / 2 - 108) + 'px';
  kk.style.transform = 'translateX(-50%) translateX(' + ((1 - a) * -700 + e * 700).toFixed(1) + 'px) rotate(' + (-3 + Math.sin(kl * 5) * 1.2).toFixed(2) + 'deg)';
  kk.style.opacity = 1 - e;
}

function drawEnd(t) {
  const end = $('end');
  const el = t - D.end.start;
  if (el < 0) { end.style.opacity = 0; return false; }
  end.style.opacity = 1;
  // camera punch-in of the whole card + slow ray spin
  $('rays').style.transform = 'rotate(' + (el * 14).toFixed(2) + 'deg) scale(' + (0.6 + 0.4 * E.outCubic(prog(el, 0, 0.6))).toFixed(3) + ')';
  const bg = end.querySelector('.bg');
  bg.style.transform = 'scale(' + (1.25 - 0.25 * E.outCubic(prog(el, 0, 0.5))).toFixed(3) + ')';
  // icon: drops in, squash on landing, then breathes
  const ia = prog(el, 0.05, 0.55);
  const land = prog(el, 0.6, 0.35);
  const sq = land > 0 && land < 1 ? Math.sin(land * Math.PI) * (1 - land) : 0;
  const breathe = el > 1 ? 1 + 0.025 * Math.sin((el - 1) * 4) : 1;
  $('icon').style.transform = 'translateY(' + ((1 - E.outBack(ia, 1.6)) * -900).toFixed(1) + 'px) rotate(' + ((1 - E.outCubic(ia)) * -25).toFixed(2) + 'deg) scale(' + ((1 + sq * 0.25) * breathe).toFixed(3) + ',' + ((1 - sq * 0.22) * breathe).toFixed(3) + ')';
  // name: words slam in
  const ws = $('name').querySelectorAll('.w');
  ws.forEach((w, k) => {
    const a = prog(el, 0.45 + k * 0.1, 0.4);
    w.style.transform = 'scale(' + Math.max(0, E.outBack(a, 2.8)).toFixed(3) + ') rotate(' + ((1 - a) * 12).toFixed(2) + 'deg)';
    w.style.opacity = a > 0 ? 1 : 0;
  });
  // the coming-soon panel rises, podium steps grow, the cup lands, the stamp slams
  const pa = prog(el, 1.0, 0.5);
  $('soon').style.transform = 'translateY(' + ((1 - E.outBack(pa, 1.4)) * 700).toFixed(1) + 'px)';
  $('soon').style.opacity = pa > 0 ? 1 : 0;
  document.querySelectorAll('.pod').forEach((p, k) => {
    const a = prog(el, 1.35 + [0.15, 0, 0.3][k], 0.45);
    p.style.transform = 'scaleY(' + Math.max(0, E.outBack(a, 2.2)).toFixed(3) + ')';
  });
  const ca = prog(el, 1.75, 0.45);
  $('cup').style.transform = 'translateY(' + ((1 - E.outBack(ca, 2)) * -260).toFixed(1) + 'px) rotate(' + (Math.sin(el * 3) * 4 * (ca >= 1 ? 1 : 0)).toFixed(2) + 'deg) scale(' + Math.max(0, E.outBack(ca, 1.8)).toFixed(3) + ')';
  $('cup').style.opacity = ca > 0 ? 1 : 0;
  const st = $('soonText').querySelectorAll('.w');
  st.forEach((w, k) => {
    const a = prog(el, 1.6 + k * 0.08, 0.36);
    w.style.transform = 'translateY(' + ((1 - E.outCubic(a)) * 50).toFixed(1) + 'px) scale(' + Math.max(0, E.outBack(a, 2.4)).toFixed(3) + ')';
    w.style.opacity = a > 0 ? 1 : 0;
  });
  const sa = prog(el, D.end.stampAt, 0.28);
  const stamp = $('stamp');
  stamp.style.opacity = sa > 0 ? 1 : 0;
  stamp.style.transform = 'rotate(' + (-12 + (1 - sa) * -20).toFixed(2) + 'deg) scale(' + (sa < 1 ? 3 - 2 * E.inCubic(sa) : 1 + 0.04 * Math.sin((el - D.end.stampAt) * 6)).toFixed(3) + ')';
  const sub = $('soonSub');
  const ba = prog(el, D.end.stampAt + 0.25, 0.4);
  sub.style.opacity = ba;
  sub.style.transform = 'translateY(' + ((1 - E.outCubic(ba)) * 40).toFixed(1) + 'px)';
  // confetti from the stamp moment (deterministic)
  const cs = document.querySelectorAll('.conf');
  cs.forEach((c, k) => {
    const tt = el - D.end.stampAt;
    if (tt < 0) { c.style.opacity = 0; return; }
    const r = (n) => (Math.sin(k * 127.1 + n * 311.7) * 43758.5453) % 1;
    const ang = -Math.PI / 2 + (Math.abs(r(1)) - 0.5) * 2.4;
    const v = 900 + Math.abs(r(2)) * 1100;
    const x = 540 + Math.cos(ang) * v * tt;
    const y = 1100 + Math.sin(ang) * v * tt + 1400 * tt * tt;
    c.style.opacity = tt < 2.6 ? 1 : 0;
    c.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (tt * (300 + Math.abs(r(3)) * 700)).toFixed(1) + 'deg) scaleX(' + Math.cos(tt * 9 + k).toFixed(2) + ')';
  });
  return true;
}

window.render = async (i) => {
  const t = i / D.fps;
  const isEnd = t >= D.end.start;
  const g = drawGameplay(i, t);
  const sh = shakeAt(t);
  $('cam').style.transform = 'translate(' + sh.x.toFixed(1) + 'px,' + sh.y.toFixed(1) + 'px) rotate(' + sh.r.toFixed(4) + 'rad)';
  const endOn = drawEnd(t);
  const el = t - D.end.start;
  // the end card comes in with a zoom-through of the last shot
  if (endOn && el < TD) {
    const p = el / TD;
    const q = E.inCubic(p);
    $('end').style.opacity = E.outCubic(p).toFixed(3);
    layerStyle(layers[0], { ...g.cur, s: g.cur.s * (1 + 1.1 * q), blur: 26 * q, op: 1, z: 2 });
    await setImg(layers[0], g.fr[0]);
    await setImg(layers[1], null);
  } else if (endOn) {
    await setImg(layers[0], null);
    await setImg(layers[1], null);
  } else {
    layerStyle(layers[0], g.cur);
    await setImg(layers[0], g.fr[0]);
    if (g.out) { layerStyle(layers[1], g.out); await setImg(layers[1], g.fr[1]); } else await setImg(layers[1], null);
  }
  drawCaption(isEnd ? -1 : t);
  return true;
};
window.ready = (async () => { await document.fonts.ready; for (const img of document.images) { if (!img.complete) await new Promise((r) => (img.onload = img.onerror = r)); } return true; })();
`;

/** Build the page. data: frames, beats, captions, kickers, shakes, flashes, end, palette, texts. */
export function directorHtml(data, { palette, iconUrl, name, soon, soonSub, stamp }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const nameHtml = name.split(' ').map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
  const soonHtml = soon
    .split(/(\*)/)
    .reduce((acc, part) => {
      if (part === '*') return { ...acc, hi: !acc.hi };
      const ws = part.split(/\s+/).filter(Boolean).map((w) => `<span class="w${acc.hi ? ' hi' : ''}">${esc(w)}</span>`);
      return { ...acc, html: acc.html + (acc.html && ws.length ? ' ' : '') + ws.join(' ') };
    }, { hi: false, html: '' }).html;
  const confetti = Array.from({ length: 46 }, (_, k) => `<div class="conf" style="left:0;top:0;background:${[palette.accent, palette.hot, '#ffffff', palette.glow, palette.bg1][k % 5]}"></div>`).join('');
  const cup = `<svg id="cup" viewBox="0 0 100 100"><path d="M28 14h44v18c0 14-9 25-22 27-13-2-22-13-22-27z" fill="#ffd34d" stroke="${palette.ink}" stroke-width="5"/><path d="M28 20H14c0 14 7 21 16 22M72 20h14c0 14-7 21-16 22" fill="none" stroke="${palette.ink}" stroke-width="5"/><path d="M28 20H14c0 14 7 21 16 22M72 20h14c0 14-7 21-16 22" fill="none" stroke="#ffd34d" stroke-width="2"/><rect x="44" y="58" width="12" height="16" fill="#ffd34d" stroke="${palette.ink}" stroke-width="5"/><rect x="32" y="74" width="36" height="12" rx="3" fill="#ffb300" stroke="${palette.ink}" stroke-width="5"/><path d="M40 22c0 10 3 17 8 21" stroke="#fff6c2" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
  const pods = [
    ['2', 300, 150, '#cfd8e6'],
    ['1', 450, 210, '#ffd34d'],
    ['3', 600, 110, '#e0a36b'],
  ]
    .map(([n, x, h, c]) => `<div class="pod" style="left:${x - 75}px;height:${h}px;background:${c}">${n}</div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(palette)}</style></head><body>
<div id="bg"></div>
<div id="cam"><div id="vig"></div><div id="streaks"></div><div class="bar" id="barT"></div><div class="bar" id="barB"></div></div>
<div class="scrim" id="scrimT"></div><div class="scrim" id="scrimB"></div>
<div id="capbox"></div><div id="cap"></div><div id="kick"></div>
<div id="end"><div class="bg"></div><div id="rays"></div>
  <div id="icon"><img src="${iconUrl}"></div>
  <div id="name" class="stroke">${nameHtml}</div>
  <div id="soon">${pods}${cup}<div id="soonText" class="stroke">${soonHtml}</div></div>
  <div id="stamp">${esc(stamp)}</div>
  <div id="soonSub" class="stroke" style="-webkit-text-stroke:10px var(--ink)">${esc(soonSub)}</div>
  ${confetti}
</div>
<div id="flash"></div>
<script>window.DATA=${JSON.stringify(data)};</script>
<script>${JS}</script>
</body></html>`;
}

export const svgDataUrl = (path) => `data:image/svg+xml;base64,${readFileSync(path).toString('base64')}`;

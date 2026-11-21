// The edit: resolves a game's beat list (games/<slug>.mjs → edit(lang)) against the recorded
// clips, renders the director page frame by frame straight into ffmpeg, renders the sound, mixes
// and encodes. Writes store/<slug>/video/promo-<lang>.mp4 and promo-<lang>.png.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FPS, H, W, videoDir, work } from './env.mjs';
import { directorHtml, svgDataUrl } from './director.mjs';
import { renderAudio } from './audio.mjs';
import { encode, mixAudio, poster } from './encode.mjs';
import { renderer, closeRenderer } from '../../lib/render.mjs';

function speedAt(sp, tau) {
  if (typeof sp === 'number') return sp;
  if (tau <= sp[0][0]) return sp[0][1];
  for (let i = 1; i < sp.length; i++) {
    if (tau <= sp[i][0]) {
      const [a, va] = sp[i - 1];
      const [b, vb] = sp[i];
      return va + ((vb - va) * (tau - a)) / (b - a);
    }
  }
  return sp[sp.length - 1][1];
}

/** Source time (ms) of a beat at beat-local time tau (s): from + ∫ speed. */
function srcTime(beat, tau) {
  const step = 1 / 240;
  let s = 0;
  for (let u = 0; u < tau; u += step) s += speedAt(beat.speed ?? 1, u + step / 2) * Math.min(step, tau - u);
  return beat.fromMs + s * 1000;
}

function nearest(frames, t) {
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? frames[lo] : frames[hi];
}

/** Resolve beats: start times, source offsets (marks), clip manifests, captions and kickers as groups. */
export function resolve(spec, root, scoreEvent = () => 1) {
  const clips = {};
  const load = (id) => {
    if (!clips[id]) {
      const p = join(root, id, 'clip.json');
      if (!existsSync(p)) throw new Error(`clip ${id} not recorded (${p}); run make.mjs with --steps record`);
      clips[id] = JSON.parse(readFileSync(p, 'utf8'));
    }
    return clips[id];
  };
  let t = 0;
  const beats = spec.beats.map((b) => {
    const c = load(b.clip);
    let fromMs;
    if (b.from && typeof b.from === 'object' && !Array.isArray(b.from)) {
      // auto: the window with the most action (weighted game events), after `min` seconds
      const span = srcTime({ ...b, fromMs: 0 }, b.dur);
      const min = (b.from.min ?? 0.8) * 1000;
      const lead = (b.from.lead ?? 0.35) * 1000;
      let best = min;
      let bestScore = -1;
      for (let off = min; off + span <= c.duration - 100; off += 100) {
        let s = 0;
        for (const e of c.events) if (e.t >= off + lead && e.t <= off + span - 250) s += scoreEvent(e);
        if (s > bestScore) {
          bestScore = s;
          best = off;
        }
      }
      fromMs = best;
    } else if (Array.isArray(b.from)) {
      const m = c.marks[b.from[0]];
      if (m === undefined) throw new Error(`clip ${b.clip}: no mark ${b.from[0]}`);
      fromMs = m + b.from[1] * 1000;
    } else fromMs = (b.from ?? 0) * 1000;
    const r = { ...b, start: t, fromMs: Math.max(0, fromMs) };
    const endMs = srcTime(r, b.dur + 0.4);
    if (endMs > c.duration + 50) console.warn(`[edit] beat ${b.clip}@${b.from}: needs ${(endMs / 1000).toFixed(2)} s of a ${(c.duration / 1000).toFixed(2)} s clip (last frame held)`);
    t += b.dur;
    return r;
  });
  const end = { start: t, dur: spec.end.dur, stampAt: spec.end.stampAt ?? 2.1 };
  const total = t + end.dur;
  // captions / kickers: consecutive beats with the same text are one group (no re-entry)
  const groups = (field) => {
    const out = [];
    for (const b of beats) {
      const text = b[field];
      if (!text) continue;
      const last = out[out.length - 1];
      if (last && last.text === text && Math.abs(last.end - b.start) < 1e-6) last.end = b.start + b.dur;
      else out.push({ key: `${field}${out.length}`, text, start: b.start + (b.capDelay ?? 0), end: b.start + b.dur, pos: b.pos ?? 'bottom', y: b.capY });
    }
    return out;
  };
  return { beats, end, total, clips, captions: groups('caption'), kickers: groups('kicker') };
}

/** Per output frame: [current layer src, outgoing layer src]. */
function framePlan(tl, root) {
  const n = Math.round(tl.total * FPS);
  const url = (clip, f) => pathToFileURL(join(root, clip, f)).href;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    let bi = tl.beats.findIndex((b) => t < b.start + b.dur);
    if (bi < 0) bi = tl.beats.length - 1;
    const b = tl.beats[bi];
    const tau = Math.min(t - b.start, b.dur + 1);
    const c = tl.clips[b.clip];
    const cur = url(b.clip, nearest(c.frames, srcTime(b, tau)).f);
    let out = null;
    const prev = tl.beats[bi - 1];
    if (prev && tau < 0.32 && t < tl.end.start) out = url(prev.clip, nearest(tl.clips[prev.clip].frames, srcTime(prev, prev.dur + tau)).f);
    frames.push([cur, out]);
  }
  return frames;
}

/** Game sound events of the shown clip spans, at their video times; shakes from big ones. */
function gameCues(tl, { shakeOn = () => 0 } = {}) {
  const cues = [];
  const shakes = [];
  for (const b of tl.beats) {
    const c = tl.clips[b.clip];
    // sample the beat's source mapping once, then place each event at its first crossing
    const samples = [];
    for (let tau = 0; tau <= b.dur + 1e-9; tau += 1 / 240) samples.push([tau, srcTime(b, tau)]);
    const s0 = samples[0][1];
    const s1 = samples[samples.length - 1][1];
    for (const e of c.events) {
      if (e.t < s0 || e.t >= s1) continue;
      const hit = samples.find(([, s]) => s >= e.t);
      const tau = hit[0];
      const at = b.start + tau;
      const sp = speedAt(b.speed ?? 1, tau);
      if (e.sfx) {
        const core = e.sfx.startsWith('@');
        cues.push({ kind: 'preset', lib: core ? 'core' : 'game', name: core ? e.sfx.slice(1) : e.sfx, t: at, pitch: (e.pitch ?? 0) + (sp < 0.7 ? -3 : 0), volume: (e.volume ?? 1) * (b.sfxVol ?? 1) });
      }
      const amp = shakeOn(e);
      if (amp > 0) shakes.push({ t: at, amp });
    }
  }
  return { cues, shakes };
}

export async function makeVideo(game, { lang, root, log }) {
  const spec = game.edit(lang);
  const tl = resolve(spec, root, game.scoreEvent);
  const out = videoDir(game.meta.slug);
  mkdirSync(out, { recursive: true });
  const tmp = work(game.meta.slug, `${lang}-edit`);
  mkdirSync(tmp, { recursive: true });
  log(`${lang}: edit ${tl.beats.length} beats, ${tl.total.toFixed(1)} s`);

  // ---- sound
  const { cues, shakes } = gameCues(tl, { shakeOn: game.shakeOn ?? (() => 0) });
  const flashes = [];
  tl.beats.forEach((b, i) => {
    if (i === 0) {
      cues.push({ kind: 'impact', t: 0.02, volume: 1 });
      return;
    }
    const tr = b.trans ?? 'whip';
    if (tr === 'whip') cues.push({ kind: 'whoosh', t: b.start + 0.12, dir: b.dir ?? 1, volume: 0.8 });
    if (tr === 'punch') {
      cues.push({ kind: 'impact', t: b.start, volume: 0.8 });
      shakes.push({ t: b.start, amp: 0.55 });
    }
    if (tr === 'flash') cues.push({ kind: 'preset', lib: 'core', name: 'pop', t: b.start, volume: 0.5, pitch: 5 });
    if (tr === 'zoom') cues.push({ kind: 'whoosh', t: b.start + 0.05, volume: 0.6 });
  });
  for (const g of tl.captions) cues.push({ kind: 'preset', lib: 'core', name: 'pop', t: g.start + 0.08, volume: 0.35, pitch: 2 });
  for (const s of spec.extraCues ?? []) cues.push(s.t < 0 ? { ...s, t: tl.end.start + -s.t } : s);
  // end card: whoosh in, icon land, stamp slam, confetti fanfare
  const e0 = tl.end.start;
  cues.push({ kind: 'whoosh', t: e0 + 0.1, volume: 0.9 });
  cues.push({ kind: 'impact', t: e0 + 0.6, volume: 0.7 });
  cues.push({ kind: 'riser', t: e0 + tl.end.stampAt, len: 1.0, volume: 0.8 });
  cues.push({ kind: 'impact', t: e0 + tl.end.stampAt + 0.25, volume: 1 });
  cues.push({ kind: 'preset', lib: 'core', name: 'win', t: e0 + tl.end.stampAt + 0.3, volume: 0.8 });
  shakes.push({ t: e0 + tl.end.stampAt + 0.25, amp: 0.6 });
  flashes.push({ t: e0 + tl.end.stampAt + 0.25, a: 0.5 });
  shakes.push({ t: 0, amp: 0.5 });
  flashes.push({ t: 0, a: 0.6 });

  const music = {
    ...game.meta.music,
    sections: spec.music ?? [
      { t: 0, level: 2, name: 'hook' },
      { t: 4, level: 3, name: 'main' },
      { t: e0, level: 1, name: 'outro' },
    ],
    hits: [{ t: 0 }, { t: e0 + tl.end.stampAt + 0.25 }],
  };
  log(`${lang}: rendering sound (${cues.length} cues)`);
  const stems = await renderAudio({ sfxPath: game.meta.sfx, cues, music, duration: tl.total + 0.6, outDir: tmp });
  const wav = join(tmp, 'mix.wav');
  const loud = await mixAudio(stems, wav, tl.total);
  log(`${lang}: mix ${JSON.stringify(loud)}`);

  // ---- picture
  const pal = game.meta.palette;
  const texts = spec.endCard;
  const data = { fps: FPS, beats: tl.beats.map(({ start, dur, trans, dir, zoom, focus, speed }) => ({ start, dur, trans, dir, zoom, focus, speed })), frames: framePlan(tl, root), captions: tl.captions, kickers: tl.kickers, shakes, flashes, end: tl.end };
  const html = join(tmp, 'director.html');
  writeFileSync(html, directorHtml(data, { palette: pal, iconUrl: svgDataUrl(game.meta.icon), name: game.meta.name[lang], soon: texts.soon, soonSub: texts.sub, stamp: texts.stamp }));
  const browser = await renderer();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[director]', String(e)));
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => window.ready);
  const file = join(out, `promo-${lang}.mp4`);
  const n = data.frames.length;
  log(`${lang}: rendering ${n} frames`);
  await encode({
    file,
    wav,
    frames: n,
    async frame(i) {
      await page.evaluate((k) => window.render(k), i);
      return page.screenshot({ type: 'jpeg', quality: 94 });
    },
    progress: (i) => i % 150 === 0 && log(`${lang}: frame ${i}/${n}`),
  });
  // poster: the end card when everything has landed
  const pi = Math.min(n - 1, Math.round((tl.end.start + Math.min(tl.end.dur - 0.3, tl.end.stampAt + 1.6)) * FPS));
  await page.evaluate((k) => window.render(k), pi);
  await poster(await page.screenshot({ type: 'png' }), join(out, `promo-${lang}.png`));
  await page.close();
  await closeRenderer();
  log(`${lang}: wrote ${file}`);
  return { file, loud, timeline: tl };
}

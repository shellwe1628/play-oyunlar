// Sound for a promo, all made by code: an OfflineAudioContext render in Chromium.
//   sfx stem   the game's own presets (games/<slug>/src/sfx.ts) and core's (tap, pop, hit, win…),
//              played through core's synth (packages/core/src/audio/synth.ts createAudio) at the
//              video times of the recorded game events, plus edit accents (whooshes on whips,
//              impacts on punches, pops on captions, the end-card stamp)
//   music stem a small arranged loop per game (kick, clap, hats, bass, pad, arp, risers), tempo
//              locked to the edit (120 BPM: a beat is 15 frames, cuts land on beats)
// The two stems are measured (EBU R128) and mixed by encode.mjs, then normalised to -14 LUFS.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, work } from './env.mjs';
import { renderer } from '../../lib/render.mjs';

async function bundle(sfxPath) {
  const dir = work('audio-kit', String(sfxPath.split(/[\\/]/).slice(-3, -2)));
  mkdirSync(dir, { recursive: true });
  const fwd = (p) => p.replace(/\\/g, '/');
  writeFileSync(
    join(dir, 'entry.ts'),
    `import { createAudio } from '${fwd(join(REPO, 'packages/core/src/audio/synth.ts'))}';
import { SFX_PRESETS } from '${fwd(join(REPO, 'packages/core/src/audio/presets.ts'))}';
import { SFX } from '${fwd(sfxPath)}';
(window as any).Kit = { createAudio, CORE: SFX_PRESETS, GAME: SFX };
`,
  );
  const { build } = await import('vite');
  await build({
    root: dir,
    configFile: false,
    logLevel: 'warn',
    build: { outDir: join(dir, 'dist'), emptyOutDir: true, minify: false, lib: { entry: join(dir, 'entry.ts'), formats: ['iife'], name: 'KitBundle', fileName: () => 'kit.js' }, reportCompressedSize: false },
  });
  return join(dir, 'dist', 'kit.js');
}

// ------------------------------------------------------------------ in-page renderer
const PAGE = `
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
function wav(chs, sr) {
  const n = chs[0].length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const x = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); o += 2; }
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// deterministic noise
function noiseBuf(ctx, sec) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
  let x = 12345; for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
  return b;
}

window.renderStem = async (stem, spec) => {
  const sr = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(sr * spec.duration), sr);
  const NOISE = noiseBuf(off, 2);
  let cursor = 0;
  // core's synth on an offline context: currentTime is the cue time, the context reads as running
  const ctx = new Proxy(off, { get(t, p) { if (p === 'currentTime') return cursor; if (p === 'state') return 'running'; const v = Reflect.get(t, p); return typeof v === 'function' ? v.bind(t) : v; } });
  const mem = new Map();
  const audio = Kit.createAudio({ storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }, key: 'video', createContext: () => ctx, maxVoices: 1e9 });
  audio.unlock();
  const master = off.createGain(); master.connect(off.destination);
  const at = (t, fn) => { cursor = t; fn(); };

  if (stem === 'sfx') {
    // a little room so the synth blips sit together
    const verb = off.createConvolver();
    const ir = off.createBuffer(2, sr * 1.2, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let x = 99 + c; for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff - 1) * Math.exp(-i / (sr * 0.25)) * 0.35; } }
    verb.buffer = ir;
    const wet = off.createGain(); wet.gain.value = 0.18; verb.connect(wet); wet.connect(off.destination);
    const out = audio.musicOutput; // unused bus
    for (const c of spec.cues) {
      if (c.kind === 'preset') {
        const preset = c.lib === 'core' ? Kit.CORE[c.name] : Kit.GAME[c.name];
        if (!preset) continue;
        at(c.t, () => audio.playPreset(preset, { pitch: c.pitch ?? 0, volume: Math.min(1, c.volume ?? 1), jitter: 0 }));
      } else if (c.kind === 'whoosh') {
        const src = off.createBufferSource(); src.buffer = NOISE;
        const bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(300, c.t - 0.22); bp.frequency.exponentialRampToValueAtTime(5200, c.t + 0.02); bp.frequency.exponentialRampToValueAtTime(900, c.t + 0.3);
        const g = off.createGain(); g.gain.setValueAtTime(0.0001, c.t - 0.24); g.gain.exponentialRampToValueAtTime(0.5 * (c.volume ?? 1), c.t); g.gain.exponentialRampToValueAtTime(0.0001, c.t + 0.32);
        const pan = off.createStereoPanner(); pan.pan.setValueAtTime(-0.7 * (c.dir ?? 1), c.t - 0.24); pan.pan.linearRampToValueAtTime(0.7 * (c.dir ?? 1), c.t + 0.3);
        src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(master); pan.connect(verb);
        src.start(c.t - 0.25); src.stop(c.t + 0.35);
      } else if (c.kind === 'impact') {
        const o = off.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, c.t); o.frequency.exponentialRampToValueAtTime(38, c.t + 0.45);
        const g = off.createGain(); g.gain.setValueAtTime(0.0001, c.t); g.gain.exponentialRampToValueAtTime(0.9 * (c.volume ?? 1), c.t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, c.t + 0.55);
        o.connect(g); g.connect(master); o.start(c.t); o.stop(c.t + 0.6);
        const n = off.createBufferSource(); n.buffer = NOISE; const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        const ng = off.createGain(); ng.gain.setValueAtTime(0.0001, c.t); ng.gain.exponentialRampToValueAtTime(0.45 * (c.volume ?? 1), c.t + 0.005); ng.gain.exponentialRampToValueAtTime(0.0001, c.t + 0.25);
        n.connect(lp); lp.connect(ng); ng.connect(master); ng.connect(verb); n.start(c.t, 0.3); n.stop(c.t + 0.3);
      } else if (c.kind === 'riser') {
        const src = off.createBufferSource(); src.buffer = NOISE; src.loop = true;
        const bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
        bp.frequency.setValueAtTime(400, c.t - c.len); bp.frequency.exponentialRampToValueAtTime(7000, c.t);
        const g = off.createGain(); g.gain.setValueAtTime(0.0001, c.t - c.len); g.gain.exponentialRampToValueAtTime(0.32 * (c.volume ?? 1), c.t - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.t + 0.05);
        src.connect(bp); bp.connect(g); g.connect(master); src.start(c.t - c.len); src.stop(c.t + 0.1);
      }
    }
  } else {
    // ------------------------------------------------ music: arranged from the edit's sections
    const m = spec.music;
    const beat = 60 / m.bpm, bar = beat * 4;
    const bus = off.createGain(); bus.gain.value = 0.8; bus.connect(audio.musicOutput ?? master);
    const duck = off.createGain(); duck.connect(bus); // sidechain-style pump on everything but the kick
    const verb = off.createConvolver();
    const ir = off.createBuffer(2, sr * 2, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let x = 7 + c; for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff - 1) * Math.exp(-i / (sr * 0.5)) * 0.3; } }
    verb.buffer = ir; const wet = off.createGain(); wet.gain.value = 0.22; verb.connect(wet); wet.connect(bus);
    const minor = m.mode === 'minor';
    const prog = minor ? [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] : [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]];
    const bassOf = minor ? [0, -4, 3, -2] : [0, -5, -3, -7];
    const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    const tone = (type, f, t, a, peak, d, dest, detune = 0, lpf = 0) => {
      const o = off.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
      const g = off.createGain(); env(g, t, a, peak, d);
      if (lpf) { const l = off.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lpf; o.connect(l); l.connect(g); } else o.connect(g);
      g.connect(dest); o.start(t); o.stop(t + a + d + 0.05); return g;
    };
    const noiseHit = (t, type, f, peak, d, dest, q = 0.8) => {
      const s = off.createBufferSource(); s.buffer = NOISE; const fl = off.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = off.createGain(); env(g, t, 0.002, peak, d); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, (t * 7.3) % 1.5); s.stop(t + d + 0.05);
    };
    const kick = (t, v = 1) => {
      const o = off.createOscillator(); o.frequency.setValueAtTime(m.style === 'neon' ? 170 : 150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      const g = off.createGain(); env(g, t, 0.003, 0.95 * v, 0.32); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4);
      noiseHit(t, 'highpass', 3000, 0.08 * v, 0.02, bus);
      duck.gain.setValueAtTime(0.45, t); duck.gain.setTargetAtTime(1, t + 0.02, 0.09);
    };
    const pan = (p) => { const s = off.createStereoPanner(); s.pan.value = p; s.connect(duck); return s; };
    const hatL = pan(-0.35), hatR = pan(0.35), arpP = pan(0.25), padP = pan(0);
    const sec = (t) => { let s = m.sections[0]; for (const x of m.sections) if (t >= x.t) s = x; return s; };
    const total = spec.duration;
    for (let b = 0; b * beat < total - 0.05; b++) {
      const t = b * beat;
      const S = sec(t);
      const lvl = S.level; // 0 quiet … 3 full
      const barIdx = Math.floor(t / bar) % 4;
      const chord = prog[barIdx].map((n) => n + m.root);
      if (S.name === 'stop') continue;
      if (lvl >= 1 && S.name !== 'outro') kick(t, lvl >= 2 ? 1 : 0.7);
      if (S.name === 'outro' && b % 4 === 0) kick(t, 0.6);
      if (lvl >= 2 && b % 2 === 1) { noiseHit(t, 'bandpass', 1800, 0.42, 0.16, duck, 0.7); tone('triangle', 210, t, 0.002, 0.2, 0.08, duck); }
      if (lvl >= 1) for (let h = 0; h < 2; h++) noiseHit(t + h * beat / 2 + beat / 4, 'highpass', 8500, h ? 0.11 : 0.07, 0.035, h ? hatR : hatL);
      if (lvl >= 3) for (let h = 0; h < 4; h += 2) noiseHit(t + h * beat / 4, 'highpass', 10000, 0.05, 0.02, hatL);
      // bass: 8ths on the chord root, an octave jump on the off-beat
      const bf = midi(bassOf[barIdx] + m.root - 12);
      for (let e = 0; e < 2; e++) {
        const tt = t + e * beat / 2;
        if (lvl >= 1) { tone('sawtooth', bf * (e ? 2 : 1), tt, 0.005, 0.16, beat / 2 - 0.04, duck, 0, 520); tone('sine', bf / 2 * (e ? 2 : 1), tt, 0.005, 0.35, beat / 2 - 0.03, duck); }
      }
      // pad: a held chord each bar (three detuned saws through a low-pass)
      if (b % 4 === 0) for (const n of chord) for (const dt of [-9, 0, 9]) tone('sawtooth', midi(n), t, 0.25, (lvl >= 1 ? 0.035 : 0.05), bar - 0.3, padP, dt, S.name === 'outro' ? 2600 : 1500).connect(verb);
      // arp: 16ths over the chord (plucky), from level 2
      if (lvl >= 2 || S.name === 'hook') {
        const pat = m.style === 'neon' ? [0, 1, 2, 1, 2, 0, 2, 1] : m.style === 'warm' ? [0, 2, 1, 2, 0, 2, 1, 2] : [0, 1, 2, 0, 1, 2, 0, 1];
        for (let s = 0; s < 4; s++) {
          const k = pat[(b * 4 + s) % pat.length];
          const f = midi(chord[k] + 12 + (s === 3 && lvl >= 3 ? 12 : 0));
          const tt = t + s * beat / 4;
          const type = m.style === 'neon' ? 'sawtooth' : m.style === 'warm' ? 'sine' : 'square';
          const g = tone(type, f, tt, 0.003, m.style === 'warm' ? 0.12 : 0.05, m.style === 'warm' ? 0.22 : 0.11, arpP, 0, m.style === 'neon' ? 3200 : 0);
          if (m.style === 'warm') tone('sine', f * 4, tt, 0.001, 0.025, 0.05, arpP);
          g.connect(verb);
        }
      }
    }
    // a crash and a chord stab on the hits the edit asks for
    for (const h of m.hits || []) {
      noiseHit(h.t, 'highpass', 4500, 0.32, 1.2, bus, 0.5);
      const chord = prog[0].map((n) => n + m.root + 12);
      for (const n of chord) tone('sawtooth', midi(n), h.t, 0.005, 0.07, 0.9, padP, 0, 3000).connect(verb);
    }
  }
  const buf = await off.startRendering();
  return wav([buf.getChannelData(0), buf.getChannelData(1)], sr);
};
`;

/** Render both stems to WAV files; returns their paths. */
export async function renderAudio({ sfxPath, cues, music, duration, outDir }) {
  const kit = await bundle(sfxPath);
  const browser = await renderer();
  const page = await browser.newPage();
  const html = join(outDir, 'audio.html');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><script src="${pathToFileURL(kit).href}"></script><script>${PAGE}</script>`);
  await page.goto(pathToFileURL(html).href);
  const out = {};
  for (const stem of ['music', 'sfx']) {
    const b64 = await page.evaluate(([s, spec]) => window.renderStem(s, spec), [stem, { cues, music, duration }]);
    out[stem] = join(outDir, `${stem}.wav`);
    writeFileSync(out[stem], Buffer.from(b64, 'base64'));
  }
  await page.close();
  return out;
}

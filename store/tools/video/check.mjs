// node store/tools/video/check.mjs <slug> [--locale tr|en]
// Checks the made videos: ffprobe facts (1080×1920, 30 fps, h264 high / yuv420p, aac 48 kHz,
// duration, size ≤ 30 MB), loudness (EBU R128), and writes for looking at:
//   <tmp>/oyun-video/<slug>/check/<lang>-sheet.png      a frame every 2 s (5×4 tiles)
//   <tmp>/oyun-video/<slug>/check/<lang>-tNN.N.png     full frames around each cut and the end card
// Exits 1 when a hard rule fails.
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpegBin, run, videoDir, work } from './lib/env.mjs';
import { loudness, probe } from './lib/encode.mjs';

const slug = process.argv[2];
const i = process.argv.indexOf('--locale');
const langs = i > 0 ? [process.argv[i + 1]] : ['tr', 'en'];
const { ffmpeg } = ffmpegBin();
const out = work(slug, 'check');
mkdirSync(out, { recursive: true });
let bad = 0;
const game = await import(`./games/${slug}.mjs`);
for (const lang of langs) {
  const file = join(videoDir(slug), `promo-${lang}.mp4`);
  if (!existsSync(file)) {
    console.log(`${lang}: missing ${file}`);
    bad++;
    continue;
  }
  const p = await probe(file);
  const l = await loudness(file);
  const rules = [
    [p.width === 1080 && p.height === 1920, '1080×1920'],
    [p.fps === '30/1', '30 fps'],
    [/^h264 High/.test(p.vcodec) && p.pix === 'yuv420p', 'h264 high yuv420p'],
    [/^aac 48000/.test(p.acodec ?? ''), 'aac 48 kHz'],
    [p.duration >= 29.5 && p.duration <= 40.5, '30–40 s'],
    [p.sizeMB <= 30, '≤ 30 MB'],
    [l.I !== null && Math.abs(l.I + 14) <= 1, '-14 LUFS ±1'],
    [l.TP !== null && l.TP <= -1, 'true peak ≤ -1 dBTP'],
  ];
  const fails = rules.filter(([ok]) => !ok).map(([, n]) => n);
  bad += fails.length;
  console.log(`${lang}: ${JSON.stringify({ ...p, loudness: l })}${fails.length ? `  FAIL: ${fails.join(', ')}` : '  ok'}`);
  await run(ffmpeg, ['-loglevel', 'error', '-y', '-i', file, '-vf', 'fps=0.5,scale=270:-1,tile=5x4', '-frames:v', '1', join(out, `${lang}-sheet.png`)]);
  // full-size frames: just after each cut, and three points of the end card
  const spec = game.edit(lang);
  let t = 0;
  const times = [];
  for (const b of spec.beats) {
    times.push(t + 0.15, t + b.dur * 0.6);
    t += b.dur;
  }
  times.push(t + 0.2, t + 1.2, t + spec.end.dur - 0.4);
  for (const s of times) {
    await run(ffmpeg, ['-loglevel', 'error', '-y', '-ss', s.toFixed(2), '-i', file, '-frames:v', '1', join(out, `${lang}-t${s.toFixed(1).padStart(4, '0')}.png`)]);
  }
  console.log(`${lang}: sheet ${join(out, `${lang}-sheet.png`)}; ${times.length} frames in ${out}`);
}
process.exit(bad ? 1 : 0);

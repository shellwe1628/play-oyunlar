// node store/tools/video/make.mjs <slug> [--locale tr|en] [--steps record,edit] [--only clip,clip] [--fresh]
//
// Makes store/<slug>/video/promo-<tr|en>.mp4 (1080×1920, 30 fps, H.264 + AAC) and a poster PNG:
//   record  plays the real game on a stepped fake clock and keeps every frame of each clip
//           (games/<slug>.mjs → CLIPS), in the OS temp folder (oyun-video/<slug>/<lang>/<clip>)
//   edit    renders the director page frame by frame over those clips (lib/director.mjs), the
//           music and sound accents (lib/audio.mjs), mixes to -14 LUFS and encodes (lib/encode.mjs)
// Without --steps both run. --only re-records just those clips. --fresh re-stages the saves.
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { log as mkLog, work } from './lib/env.mjs';

const slug = process.argv[2];
if (!slug || slug.startsWith('-')) {
  console.error('usage: node store/tools/video/make.mjs <okcu|kivilcim|fosil> [--locale tr|en] [--steps record,edit] [--only clip,clip] [--fresh]');
  process.exit(2);
}
const flag = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? null : (process.argv[i + 1] ?? '');
};
const langs = flag('locale') ? [flag('locale').slice(0, 2)] : ['tr', 'en'];
const steps = (flag('steps') ?? 'record,edit').split(',');
const only = flag('only')?.split(',') ?? null;
const fresh = process.argv.includes('--fresh');
const log = mkLog(`video ${slug}`);

const game = await import(pathToFileURL(join(import.meta.dirname, 'games', `${slug}.mjs`)).href);
const problems = [];
for (const lang of langs) {
  const root = work(slug, lang);
  mkdirSync(root, { recursive: true });
  if (steps.includes('record')) {
    log(`${lang}: recording`);
    problems.push(...(await game.record({ lang, root, only, log, fresh })).map((p) => `${lang} ${p}`));
  }
  if (steps.includes('edit')) {
    const { makeVideo } = await import('./lib/edit.mjs');
    await makeVideo(game, { lang, root, log });
  }
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
log('done');

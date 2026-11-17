// node store/tools/capture.mjs <slug> [--locale en-US|tr-TR] [--only id,id]
// Builds the game at 2× render resolution, stages saves with the game's own sim, plays every shot
// in store/<slug>/listing.config.mjs through the ?test=1 hook and writes raw 1440×2560 captures to
// store/<slug>/.raw/<locale>/NN-<id>.png (input for compose.mjs and art.mjs).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureBuild, serve } from './lib/build.mjs';
import { launch, openGame } from './lib/browser.mjs';
import { flag, loadConfig, locales } from './lib/config.mjs';
import { LANG, LOCALES, rawDir, slugArg, storeDir } from './lib/paths.mjs';
import { withGameModules } from './lib/sim.mjs';

const slug = slugArg();
const cfg = await loadConfig(slug);
const only = flag('only')?.split(',') ?? null;
const t0 = Date.now();
const log = (m) => console.log(`[capture ${slug} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

writeFileSync(join(storeDir(slug), '.gitignore'), '# raw hi-res captures (regenerate with store/tools/capture.mjs)\n.raw/\n');

log('staging saves with the game sim');
const saves = cfg.stage ? await withGameModules(slug, (load) => cfg.stage(load)) : {};
log(`staged: ${Object.keys(saves).join(', ') || '(none)'}`);
log('capture build (2× render)');
const build = await captureBuild(slug);
const server = await serve(build.dir);
const browser = await launch();
const failures = [];
try {
  for (const locale of locales(LOCALES)) {
    const dir = rawDir(slug, locale);
    mkdirSync(dir, { recursive: true });
    if (!only) rmSync(dir, { recursive: true, force: true }), mkdirSync(dir, { recursive: true });
    for (const [i, shot] of cfg.shots.entries()) {
      if (only && !only.includes(shot.id)) continue;
      const name = `${String(i + 1).padStart(2, '0')}-${shot.id}.png`;
      const save = shot.save ? saves[shot.save] : undefined;
      if (shot.save && !save) throw new Error(`shot ${shot.id}: unknown save "${shot.save}"`);
      const g = await openGame(browser, build, {
        url: server.url,
        seed: shot.seed ?? cfg.seed ?? 1,
        lang: LANG[locale],
        storage: save ? cfg.storageFor(save) : {},
        stampLastSeen: save ? (cfg.stampLastSeen ?? []) : [],
      });
      try {
        await shot.run(g, { locale, lang: LANG[locale] });
        await g.shot(join(dir, name));
        const errs = g.errors.filter((e) => !/\[oyun\]/.test(e) || /missing string/.test(e));
        if (errs.length) failures.push(`${locale} ${shot.id}: ${errs.join(' | ')}`);
        log(`${locale} ${name}`);
      } catch (e) {
        failures.push(`${locale} ${shot.id}: ${e.message}`);
        log(`${locale} ${name} FAILED: ${e.message}`);
      } finally {
        await g.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
log('done');

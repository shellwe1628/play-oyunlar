// node store/tools/capture.mjs <slug> [--locale en-US|tr-TR] [--only id,id] [--cached-saves]
// Builds the game at 2× render resolution, stages saves with the game's own sim, plays every shot
// in store/<slug>/listing.config.mjs through the ?test=1 hook and writes raw 1440×2560 captures to
// store/<slug>/.raw/<locale>/NN-<id>.png (input for compose.mjs and art.mjs).
// A listing with `app: 'apps/<name>'` captures that web app instead of games/<slug> (built
// unchanged, opened at 2× device scale, driven through its own test hook `cfg.hook`; see
// lib/webapp.mjs). Its saves are still staged with games/<slug>'s sim.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { captureBuild, serve } from './lib/build.mjs';
import { launch, openGame } from './lib/browser.mjs';
import { flag, loadConfig, locales } from './lib/config.mjs';
import { LANG, LOCALES, rawDir, REPO, slugArg, storeDir, tmp } from './lib/paths.mjs';
import { withGameModules } from './lib/sim.mjs';
import { appBuild, botScript, openApp, WEBGL_ARGS } from './lib/webapp.mjs';

const slug = slugArg();
const cfg = await loadConfig(slug);
const only = flag('only')?.split(',') ?? null;
const t0 = Date.now();
const log = (m) => console.log(`[capture ${slug} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

writeFileSync(join(storeDir(slug), '.gitignore'), '# raw hi-res captures (regenerate with store/tools/capture.mjs)\n.raw/\n');

// --cached-saves: reuse the saves staged by the previous run (while iterating on shots)
const savesCache = tmp(`saves-${slug}.json`);
let saves;
if (process.argv.includes('--cached-saves') && existsSync(savesCache)) {
  log('reusing staged saves from the previous run (--cached-saves)');
  saves = JSON.parse(readFileSync(savesCache, 'utf8'));
} else {
  log('staging saves with the game sim');
  saves = cfg.stage ? await withGameModules(slug, (load) => cfg.stage(load)) : {};
  mkdirSync(tmp(), { recursive: true });
  writeFileSync(savesCache, JSON.stringify(saves));
}
log(`staged: ${Object.keys(saves).join(', ') || '(none)'}`);
log(cfg.app ? `app build ${cfg.app} (2× device scale)` : 'capture build (2× render)');
const build = cfg.app ? await appBuild(cfg.app) : await captureBuild(slug);
const bot = cfg.app && cfg.bot ? await botScript(resolve(storeDir(slug), cfg.bot), join(REPO, 'games', slug)) : null;
const server = await serve(build.dir);
const browser = await launch(cfg.app ? { args: WEBGL_ARGS } : {});
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
      const g = cfg.app
        ? await openApp(browser, build, {
            url: server.url,
            hook: cfg.hook,
            query: { seed: shot.seed ?? cfg.seed ?? 1, lang: LANG[locale], ...(shot.query ?? {}) },
            locale,
            htmlLang: cfg.htmlLang ? LANG[locale] : null,
            storage: save ? cfg.storageFor(save) : {},
            bot,
          })
        : await openGame(browser, build, {
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

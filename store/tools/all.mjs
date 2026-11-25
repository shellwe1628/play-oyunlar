// node store/tools/all.mjs <slug>
// The whole listing for one game, in order: capture → compose → art → validate.
// Needs store/<slug>/listing.config.mjs (node store/tools/new.mjs <slug> writes a starter) and
// the texts in store/<slug>/metadata/android/<locale>/.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { slugArg, TOOLS } from './lib/paths.mjs';

const slug = slugArg();
for (const step of ['capture', 'compose', 'art', 'validate']) {
  console.log(`\n=== ${step} ${slug} ===`);
  const r = spawnSync(process.execPath, [join(TOOLS, `${step}.mjs`), slug], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n${step} failed (exit ${r.status}); stopped.`);
    process.exit(r.status ?? 1);
  }
}

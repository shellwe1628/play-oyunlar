#!/usr/bin/env node
// Scaffold a new game from templates/game.
//   npm run new-game -- <slug> "<Title>" [portrait|landscape] [--force] [--no-install]
// Writes games/<slug>/, replaces __SLUG__/__TITLE__/__ORIENTATION__/__APP_ID__, then runs
// `npm install` so the new workspace is linked and package-lock.json is updated.
// Run it from one agent at a time: concurrent `npm install`s fight over package-lock.json.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appIdFor, renderTemplate, ROOT } from './template.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [slug, title, orientation = 'portrait'] = args.filter((a) => !a.startsWith('--'));

function fail(msg) {
  console.error(`new-game: ${msg}`);
  console.error('usage: npm run new-game -- <slug> "<Title>" [portrait|landscape] [--force] [--no-install]');
  process.exit(1);
}

if (!slug || !title) fail('slug and title are required');
if (!/^[a-z][a-z0-9-]{1,30}$/.test(slug)) fail(`slug "${slug}" must match ^[a-z][a-z0-9-]{1,30}$`);
if (orientation !== 'portrait' && orientation !== 'landscape') fail(`orientation must be portrait or landscape, got "${orientation}"`);

const dest = join(ROOT, 'games', slug);
if (existsSync(dest)) {
  if (!flags.has('--force')) fail(`games/${slug} already exists (use --force to overwrite)`);
  for (const entry of readdirSync(dest)) {
    if (entry === 'node_modules' || entry === 'android' || entry === 'ios') continue;
    rmSync(join(dest, entry), { recursive: true, force: true });
  }
}

for (const [rel, content] of renderTemplate(slug, title, orientation)) {
  const p = join(dest, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}
console.log(`new-game: created games/${slug} (${orientation}, appId ${appIdFor(slug)})`);

if (!flags.has('--no-install')) {
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail('npm install failed');
}
console.log(`next: fill in games/${slug}/GAME.md, then run: npm run gate -- ${slug}`);

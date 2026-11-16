#!/usr/bin/env node
// Quality gate (design doc §4, stage 4).
//   npm run gate               core + every game in games/
//   npm run gate -- <slug>     core + one game
// Per game, in order, failing fast: typecheck → lint → unit → build → size → smoke.
// Core runs first: template drift → README snippets → typecheck → lint → unit.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { listFiles, renderTemplate, ROOT } from './template.mjs';

/** Bundle budget (decision recorded in packages/core/README.md). */
export const BUDGET = {
  /** gzip size of all JS in dist/ — Phaser 4 alone is ~345 KB of this. */
  jsGzipKb: 550,
  /** raw size of everything in dist/ (fonts included). */
  totalKb: 5 * 1024,
};

const BIN = join(ROOT, 'node_modules', '.bin');
const bin = (name) => join(BIN, name);
const results = [];
const t0 = Date.now();

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === 'object' && addr ? addr.port : 4319));
    });
  });
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, output: r.error ? `${output}\n${r.error.message}` : output };
}

function tail(text, lines = 60) {
  const all = text.trimEnd().split('\n');
  return (all.length > lines ? ['…', ...all.slice(-lines)] : all).join('\n');
}

async function stage(target, name, fn) {
  const start = Date.now();
  process.stdout.write(`  ${target.padEnd(12)} ${name.padEnd(10)} … `);
  let res;
  try {
    res = await fn();
  } catch (e) {
    res = { ok: false, output: String(e?.stack ?? e) };
  }
  const ms = Date.now() - start;
  results.push({ target, name, ok: res.ok, ms, note: res.note ?? '' });
  console.log(`${res.ok ? 'ok  ' : 'FAIL'} ${(ms / 1000).toFixed(1)}s${res.note ? `  ${res.note}` : ''}`);
  if (!res.ok) {
    console.log(`\n----- ${target} / ${name} output -----\n${tail(res.output)}\n-----`);
    summary();
    process.exit(1);
  }
}

function summary() {
  const failed = results.find((r) => !r.ok);
  console.log('\nGATE SUMMARY');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.target.padEnd(12)} ${r.name.padEnd(10)} ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${r.note}`);
  }
  console.log(failed ? `\nGATE FAILED at ${failed.target} / ${failed.name}` : `\nGATE PASSED in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function templateDrift() {
  const dir = join(ROOT, 'games', 'ornek');
  if (!existsSync(dir)) return { ok: false, output: 'games/ornek is missing: npm run new-game -- ornek "Örnek"' };
  const meta = JSON.parse(readFileSync(join(dir, 'oyun.config.json'), 'utf8'));
  const expected = renderTemplate('ornek', meta.title, meta.orientation);
  const actual = new Set(listFiles(dir));
  const problems = [];
  for (const [rel, content] of expected) {
    if (!actual.has(rel)) problems.push(`missing in games/ornek: ${rel}`);
    else if (!Buffer.from(content).equals(readFileSync(join(dir, rel)))) problems.push(`differs from template: ${rel}`);
    actual.delete(rel);
  }
  for (const rel of actual) problems.push(`not in template: ${rel}`);
  return problems.length
    ? { ok: false, output: `games/ornek must be an unedited render of templates/game.\nEdit the template, then: npm run new-game -- ornek "Örnek" --force\n${problems.join('\n')}` }
    : { ok: true, note: `${expected.size} files match` };
}

function bundleSize(dist) {
  if (!existsSync(dist)) return { ok: false, output: `${dist} missing; build did not run` };
  let js = 0;
  let total = 0;
  for (const rel of listFiles(dist)) {
    const p = join(dist, rel);
    const size = statSync(p).size;
    total += size;
    if (rel.endsWith('.js')) js += gzipSync(readFileSync(p), { level: 9 }).length;
  }
  const jsKb = js / 1024;
  const totalKb = total / 1024;
  const note = `js ${jsKb.toFixed(0)}/${BUDGET.jsGzipKb} KB gz, total ${totalKb.toFixed(0)}/${BUDGET.totalKb} KB`;
  const ok = jsKb <= BUDGET.jsGzipKb && totalKb <= BUDGET.totalKb;
  return { ok, note, output: ok ? '' : `bundle over budget: ${note}` };
}

async function gateCore() {
  await stage('core', 'template', () => templateDrift());
  await stage('core', 'readme', () => run(process.execPath, [join(ROOT, 'tools', 'check-readme.mjs')]));
  await stage('core', 'typecheck', () => run(bin('tsc'), ['-p', 'packages/core/tsconfig.json']));
  await stage('core', 'lint', () => run(bin('eslint'), ['packages', 'tools', 'eslint.config.mjs']));
  await stage('core', 'unit', () => run(bin('vitest'), ['run', '--root', 'packages/core']));
}

async function gateGame(slug) {
  const dir = join(ROOT, 'games', slug);
  const rel = relative(ROOT, dir);
  if (!existsSync(join(dir, 'oyun.config.json'))) {
    results.push({ target: slug, name: 'exists', ok: false, ms: 0, note: `${rel}/oyun.config.json not found` });
    console.log(`  ${slug}: ${rel}/oyun.config.json not found`);
    summary();
    process.exit(1);
  }
  await stage(slug, 'typecheck', () => run(bin('tsc'), ['-p', `${rel}/tsconfig.json`]));
  await stage(slug, 'lint', () => run(bin('eslint'), [rel]));
  await stage(slug, 'unit', () => run(bin('vitest'), ['run', '--root', rel]));
  await stage(slug, 'build', () => run(bin('vite'), ['build', '--logLevel', 'warn'], { cwd: dir }));
  await stage(slug, 'size', () => bundleSize(join(dir, 'dist')));
  await stage(slug, 'smoke', async () => {
    const port = await freePort();
    const r = run(bin('playwright'), ['test', '-c', `${rel}/playwright.config.ts`], { env: { OYUN_PORT: String(port) } });
    const shots = existsSync(join(dir, 'tests', 'artifacts'))
      ? readdirSync(join(dir, 'tests', 'artifacts')).filter((f) => f.endsWith('.png'))
      : [];
    return { ...r, note: `screenshots: ${shots.length ? `${rel}/tests/artifacts/{${shots.join(',')}}` : 'none'}` };
  });
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const all = existsSync(join(ROOT, 'games'))
  ? readdirSync(join(ROOT, 'games')).filter((d) => existsSync(join(ROOT, 'games', d, 'oyun.config.json'))).sort()
  : [];
const games = requested.length ? requested : all;

console.log(`gate: core + ${games.length ? games.join(', ') : '(no games)'}`);
await gateCore();
for (const slug of games) await gateGame(slug);
summary();

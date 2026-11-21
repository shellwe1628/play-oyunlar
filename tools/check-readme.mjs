#!/usr/bin/env node
// Type-checks every ```ts block in packages/core/README.md so the docs cannot drift from the
// code. Each block becomes its own module inside a temporary folder in games/ornek (so it
// resolves @oyun/core, phaser and the game's tsconfig) and is removed afterwards.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './template.mjs';

const readme = readFileSync(join(ROOT, 'packages', 'core', 'README.md'), 'utf8');
const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
const dir = join(ROOT, 'games', 'ornek', `.readme-check-${process.pid}`);

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
try {
  blocks.forEach((code, i) => writeFileSync(join(dir, `block${String(i + 1).padStart(2, '0')}.ts`), `${code}\nexport {};\n`));
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { noUnusedLocals: false }, include: ['*.ts'] }),
  );
  const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`.replace(/\S*\.readme-check-\d+\//g, 'README ');
  if (r.status !== 0) {
    console.error(out);
    console.error('check-readme: type errors in README ts blocks (blockNN = the NN-th ts block)');
    process.exitCode = 1;
  } else {
    console.log(`check-readme: ${blocks.length} ts blocks type-check`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

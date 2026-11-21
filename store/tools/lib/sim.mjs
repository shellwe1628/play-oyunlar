// Loads a game's pure TypeScript modules (src/sim, src/strings) in Node through Vite's SSR loader,
// so staging can run the game's own rules to produce a realistic save. Read-only.
import { join } from 'node:path';
import { REPO } from './paths.mjs';

export async function withGameModules(slug, fn) {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: join(REPO, 'games', slug),
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    const load = (path) => server.ssrLoadModule(path);
    return await fn(load);
  } finally {
    await server.close();
  }
}

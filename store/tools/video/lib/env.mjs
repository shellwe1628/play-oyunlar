// Shared bits of the promo-video pipeline: where ffmpeg is, a GPU Chromium, cache folders.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { REPO, STORE } from '../../lib/paths.mjs';

export { REPO, STORE };
export const W = 1080;
export const H = 1920;
export const FPS = 30;

/** Work folder for frames and intermediate files (not committed). */
export const work = (...p) => join(tmpdir(), 'oyun-video', ...p);
export const videoDir = (slug) => join(STORE, slug, 'video');

function findBin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  try {
    execFileSync(exe, ['-version'], { stdio: 'ignore' });
    return exe;
  } catch {
    /* not on PATH: look in the winget package folder */
  }
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages') : null;
  if (base && existsSync(base)) {
    for (const pkg of readdirSync(base).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
      for (const sub of readdirSync(join(base, pkg))) {
        const p = join(base, pkg, sub, 'bin', exe);
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error(`${name} not found (install ffmpeg, e.g. winget install Gyan.FFmpeg)`);
}

let ff = null;
export function ffmpegBin() {
  ff ??= { ffmpeg: findBin('ffmpeg'), ffprobe: findBin('ffprobe') };
  return ff;
}

/** Run ffmpeg/ffprobe; resolves with stderr+stdout text, rejects on a non-zero exit. */
export function run(bin, args, { input = null } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${bin} ${args.slice(0, 6).join(' ')} … exited ${code}\n${out.slice(-2000)}`))));
    if (input) input(p.stdin);
  });
}

/**
 * Chromium on the real GPU (ANGLE/D3D11 on Windows): the 3D game renders a frame in ~30 ms
 * instead of ~1 s with SwiftShader. Falls back to the default launch.
 */
export async function launchGpu() {
  const args = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-gpu', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch();
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (tag) => {
  const t0 = Date.now();
  return (m) => console.log(`[${tag} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
};

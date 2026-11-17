#!/usr/bin/env node
// The rolling GitHub release that carries the TEST APKs, and its manifest (versions.json).
// Shared by tools/apk.mjs (bakes the release URL into the test apps' native updater, writes
// versions.json) and .github/workflows/test-apk.yml (release notes).
//   node tools/test-apk/release.mjs notes <versions.json>   → Markdown release notes on stdout
// Never used by the Play path (tools/aab.mjs, play-yukle.yml).
import { readFileSync } from 'node:fs';

/** One pre-release, replaced in place on every build: its assets are the latest test APKs. */
export const TEST_RELEASE_TAG = 'test-latest';
export const DEFAULT_REPOSITORY = 'shellwe1628/play-oyunlar';
export const MANIFEST_FILE = 'versions.json';
export const MANIFEST_SCHEMA = 1;

/** owner/repo: GitHub Actions sets GITHUB_REPOSITORY (a fork then checks its own release). */
export function repository(env = process.env) {
  const repo = env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new Error(`GITHUB_REPOSITORY "${repo}" is not owner/repo`);
  return repo;
}

/** Public download base of the release assets: <base><file>. */
export function releaseBase(repo = repository()) {
  return `https://github.com/${repo}/releases/download/${TEST_RELEASE_TAG}/`;
}

/**
 * versions.json. `apps`: one entry per built app (see apps/test-paketi/src/update/manifest.ts for
 * the rules the phone applies before trusting it).
 */
export function buildManifest({ apps, commit, generatedAt }) {
  return {
    schema: MANIFEST_SCHEMA,
    generatedAt,
    commit,
    apps: apps.map((a) => ({
      applicationId: a.applicationId,
      versionCode: a.versionCode,
      versionName: a.versionName,
      file: a.file,
      size: a.size,
      sha256: a.sha256,
      builtAt: a.builtAt,
      notes: a.notes,
      label: a.label,
    })),
  };
}

/** Release page text (Turkish, for the owner). */
export function releaseNotes(manifest, repo = repository()) {
  const base = releaseBase(repo);
  const rows = manifest.apps.map((a) => `| ${a.label?.tr ?? a.applicationId} | \`${a.applicationId}\` | ${a.versionCode} | [${a.file}](${base}${a.file}) | ${(a.size / 1024 / 1024).toFixed(1)} MB |`);
  return [
    '**Yalnız test içindir.** Bu sürüm her derlemede yerinde güncellenir; Google Play ile ilgisi yoktur.',
    '',
    `Commit \`${manifest.commit}\` · ${manifest.generatedAt}`,
    `Değişiklik: ${manifest.apps[0]?.notes || '—'}`,
    '',
    '| Uygulama | Kimlik | versionCode | APK | Boyut |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    'Kurulu test uygulamaları bu sürümü kendileri bulur ve "Güncelle" düğmesi gösterir. İlk kurulum',
    've ayrıntılar: `apps/test-paketi/README.md` ("Güncellemeler").',
    '',
    `SHA-256 değerleri: [${MANIFEST_FILE}](${base}${MANIFEST_FILE})`,
    '',
  ].join('\n');
}

// CLI
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd !== 'notes' || !file) {
    console.error('usage: node tools/test-apk/release.mjs notes <versions.json>');
    process.exit(2);
  }
  process.stdout.write(releaseNotes(JSON.parse(readFileSync(file, 'utf8'))));
}

import { describe, expect, it } from 'vitest';
import { checkDownload, findOffer, parseManifest, type ManifestApp } from '../../src/update/manifest';

const SHA = 'a'.repeat(64);
const app = (over: Partial<ManifestApp> = {}): ManifestApp => ({
  applicationId: 'com.playoyunlar.sparkrise.test',
  versionCode: 462000,
  versionName: 'test-2026-11-17-abc1234',
  file: 'kivilcim-test-462000.apk',
  size: 5_400_000,
  sha256: SHA,
  builtAt: '2026-11-17T20:00:00.000Z',
  notes: 'Sparkrise: faster restart',
  ...over,
});
const doc = (apps: unknown[], over: Record<string, unknown> = {}): string =>
  JSON.stringify({ schema: 1, generatedAt: '2026-11-17T20:00:00.000Z', commit: 'abc1234', apps, ...over });

describe('parseManifest', () => {
  it('accepts a well-formed manifest', () => {
    const r = parseManifest(doc([app(), app({ applicationId: 'com.playoyunlar.testpaketi', file: 'play-oyunlar-test-462000.apk' })]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.apps.map((a) => a.applicationId)).toEqual(['com.playoyunlar.sparkrise.test', 'com.playoyunlar.testpaketi']);
  });

  it('rejects text that is not JSON (an HTML error page, a truncated body)', () => {
    expect(parseManifest('<html>Not Found</html>').ok).toBe(false);
    expect(parseManifest(doc([app()]).slice(0, 40)).ok).toBe(false);
    expect(parseManifest('').ok).toBe(false);
  });

  it('rejects an unknown schema version and a missing app list', () => {
    expect(parseManifest(doc([app()], { schema: 2 })).ok).toBe(false);
    expect(parseManifest(JSON.stringify({ schema: 1 })).ok).toBe(false);
    expect(parseManifest('[]').ok).toBe(false);
    expect(parseManifest('null').ok).toBe(false);
  });

  it.each([
    ['versionCode not an integer', { versionCode: 1.5 }],
    ['versionCode as a string', { versionCode: '462000' }],
    ['versionCode zero', { versionCode: 0 }],
    ['sha256 upper case / short', { sha256: 'ABC' }],
    ['file with a path', { file: '../evil.apk' }],
    ['file that is a URL', { file: 'https://evil.example/x.apk' }],
    ['file without .apk', { file: 'kivilcim-test' }],
    ['size zero', { size: 0 }],
    ['size above 200 MB', { size: 300 * 1024 * 1024 }],
    ['bad application id', { applicationId: 'not an id' }],
    ['notes not a string', { notes: 42 }],
  ])('rejects an app entry with %s', (_name, over) => {
    expect(parseManifest(doc([{ ...app(), ...over }])).ok).toBe(false);
  });

  it('rejects two entries for one application id', () => {
    expect(parseManifest(doc([app(), app({ versionCode: 1 })])).ok).toBe(false);
  });

  it('cuts an overlong notes line to one short line', () => {
    const r = parseManifest(doc([app({ notes: `first line\nsecond line ${'x'.repeat(300)}` })]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.apps[0]?.notes.includes('\n')).toBe(false);
      expect(r.manifest.apps[0]?.notes.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('findOffer', () => {
  const m = (apps: ManifestApp[]) => {
    const r = parseManifest(doc(apps));
    if (!r.ok) throw new Error(r.error);
    return r.manifest;
  };
  const installed = { applicationId: 'com.playoyunlar.sparkrise.test', versionCode: 461000 };

  it('offers a higher versionCode for the own application id', () => {
    expect(findOffer(m([app()]), installed)?.versionCode).toBe(462000);
  });
  it('offers nothing for an equal or older version', () => {
    expect(findOffer(m([app({ versionCode: 461000 })]), installed)).toBeNull();
    expect(findOffer(m([app({ versionCode: 460000 })]), installed)).toBeNull();
  });
  it('never offers another app’s APK', () => {
    expect(findOffer(m([app({ applicationId: 'com.playoyunlar.testpaketi' })]), installed)).toBeNull();
  });
});

describe('checkDownload', () => {
  it('passes only when size and SHA-256 both match', () => {
    expect(checkDownload(app(), { bytes: 5_400_000, sha256: SHA })).toBe('ok');
    expect(checkDownload(app(), { bytes: 5_400_000, sha256: SHA.toUpperCase() })).toBe('ok');
    expect(checkDownload(app(), { bytes: 5_399_999, sha256: SHA })).toBe('size');
    expect(checkDownload(app(), { bytes: 5_400_000, sha256: 'b'.repeat(64) })).toBe('checksum');
  });
});

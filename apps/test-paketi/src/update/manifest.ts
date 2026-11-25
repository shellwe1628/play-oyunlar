/**
 * versions.json of the rolling test release (tools/test-apk/manifest.mjs writes it; the native
 * TestUpdate plugin fetches it). Everything read from it is checked here before use: the file
 * name becomes part of a download URL (native code also re-checks it), size and SHA-256 decide
 * whether a downloaded APK may be handed to the installer.
 */
export const MANIFEST_SCHEMA = 1;
/** Largest APK we accept (the test APKs are ~5 MB). */
export const MAX_APK_BYTES = 200 * 1024 * 1024;
/** Longest "what changed" line shown in the banner. */
export const MAX_NOTES = 120;

export interface ManifestApp {
  applicationId: string;
  versionCode: number;
  versionName: string;
  /** Asset name in the release, e.g. kivilcim-test-462000.apk (no path, no URL). */
  file: string;
  size: number;
  /** Lower-case hex. */
  sha256: string;
  /** ISO time of the build. */
  builtAt: string;
  /** One short line: the commit subject. */
  notes: string;
}

export interface Manifest {
  schema: typeof MANIFEST_SCHEMA;
  generatedAt: string;
  commit: string;
  apps: ManifestApp[];
}

export type ParseResult = { ok: true; manifest: Manifest } | { ok: false; error: string };

const APP_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
/** Same rule as TestUpdatePlugin.java. */
export const APK_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.apk$/;
const SHA256 = /^[0-9a-f]{64}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function oneLine(s: string): string {
  const line = s.split(/\r?\n/)[0]?.trim() ?? '';
  return line.length > MAX_NOTES ? `${line.slice(0, MAX_NOTES - 1)}…` : line;
}

function parseApp(v: unknown, i: number): ManifestApp | string {
  if (!isObject(v)) return `apps[${i}] is not an object`;
  const { applicationId, versionCode, versionName, file, size, sha256, builtAt, notes } = v;
  if (typeof applicationId !== 'string' || !APP_ID.test(applicationId)) return `apps[${i}].applicationId is invalid`;
  if (!isInt(versionCode, 1, 2_100_000_000)) return `apps[${i}].versionCode is invalid`;
  if (typeof versionName !== 'string' || versionName.length > 100) return `apps[${i}].versionName is invalid`;
  if (typeof file !== 'string' || !APK_FILE.test(file)) return `apps[${i}].file is invalid`;
  if (!isInt(size, 1, MAX_APK_BYTES)) return `apps[${i}].size is invalid`;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return `apps[${i}].sha256 is invalid`;
  if (typeof builtAt !== 'string' || Number.isNaN(Date.parse(builtAt))) return `apps[${i}].builtAt is invalid`;
  if (notes !== undefined && typeof notes !== 'string') return `apps[${i}].notes is invalid`;
  return { applicationId, versionCode, versionName, file, size, sha256, builtAt, notes: oneLine(notes ?? '') };
}

export function parseManifest(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  if (!isObject(data)) return { ok: false, error: 'not an object' };
  if (data.schema !== MANIFEST_SCHEMA) return { ok: false, error: `unknown schema ${String(data.schema)}` };
  if (!Array.isArray(data.apps)) return { ok: false, error: 'apps is not a list' };
  const apps: ManifestApp[] = [];
  for (const [i, raw] of data.apps.entries()) {
    const app = parseApp(raw, i);
    if (typeof app === 'string') return { ok: false, error: app };
    if (apps.some((a) => a.applicationId === app.applicationId)) return { ok: false, error: `${app.applicationId} listed twice` };
    apps.push(app);
  }
  return {
    ok: true,
    manifest: {
      schema: MANIFEST_SCHEMA,
      generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : '',
      commit: typeof data.commit === 'string' ? data.commit : '',
      apps,
    },
  };
}

/** The entry for this app, only if it is strictly newer than what is installed. */
export function findOffer(manifest: Manifest, installed: { applicationId: string; versionCode: number }): ManifestApp | null {
  const entry = manifest.apps.find((a) => a.applicationId === installed.applicationId);
  return entry && entry.versionCode > installed.versionCode ? entry : null;
}

export function checkDownload(expected: ManifestApp, got: { bytes: number; sha256: string }): 'ok' | 'size' | 'checksum' {
  if (got.bytes !== expected.size) return 'size';
  if (got.sha256.toLowerCase() !== expected.sha256) return 'checksum';
  return 'ok';
}

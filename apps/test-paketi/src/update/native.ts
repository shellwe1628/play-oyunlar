/**
 * Thin adapter over the TestUpdate native plugin (apps/test-paketi/native/TestUpdatePlugin.java,
 * added by tools/apk.mjs to test builds only). It talks to Capacitor's native bridge directly
 * (window.Capacitor.nativePromise / addListener, which the bridge injects into every page), so
 * the updater needs no npm dependency and the games' bundles are untouched.
 * Network access is native: GitHub release downloads redirect to another host and send no CORS
 * headers, so a WebView fetch() cannot read them; the plugin also only ever fetches the fixed
 * release URL baked into it, JavaScript passes file names, never URLs.
 */
export interface NativeInfo {
  applicationId: string;
  versionCode: number;
  versionName: string;
  sdk: number;
}

export interface TestUpdateNative {
  info(): Promise<NativeInfo>;
  /** GET versions.json of the test release. Rejects with code NETWORK when offline. */
  check(): Promise<{ status: number; body: string }>;
  canInstall(): Promise<{ canInstall: boolean }>;
  /** Opens Android's "Install unknown apps" screen for this app; resolves when the user is back. */
  openInstallSettings(): Promise<{ canInstall: boolean }>;
  /** Downloads to the app cache, verifying size and SHA-256 while streaming. */
  download(o: { file: string; size: number; sha256: string }): Promise<{ bytes: number; sha256: string }>;
  /** Re-checks the file and hands it to Android's package installer. */
  install(o: { file: string; sha256: string }): Promise<{ result: 'installed' | 'cancelled' | 'failed' }>;
  onProgress(cb: (p: { received: number; total: number }) => void): void;
}

interface CapacitorBridge {
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  addListener?: (plugin: string, event: string, cb: (data: unknown) => void) => unknown;
  PluginHeaders?: { name: string }[];
}

export const PLUGIN = 'TestUpdate';

/** The plugin, or null in a browser / a build without it (then the updater does nothing). */
export function nativeUpdater(): TestUpdateNative | null {
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  const call = cap?.nativePromise;
  const listen = cap?.addListener;
  if (!cap || typeof call !== 'function' || typeof listen !== 'function') return null;
  if (!cap.PluginHeaders?.some((h) => h.name === PLUGIN)) return null;
  const invoke = <T>(method: string, options?: unknown): Promise<T> => call.call(cap, PLUGIN, method, options ?? {}) as Promise<T>;
  return {
    info: () => invoke('info'),
    check: () => invoke('check'),
    canInstall: () => invoke('canInstall'),
    openInstallSettings: () => invoke('openInstallSettings'),
    download: (o) => invoke('download', o),
    install: (o) => invoke('install', o),
    onProgress: (cb) => {
      listen.call(cap, PLUGIN, 'progress', (d) => {
        const p = d as { received?: unknown; total?: unknown } | null;
        if (p && typeof p.received === 'number' && typeof p.total === 'number') cb({ received: p.received, total: p.total });
      });
    },
  };
}

/** Error code of a rejected native call (Capacitor puts it on `.code`). */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'UNKNOWN';
}

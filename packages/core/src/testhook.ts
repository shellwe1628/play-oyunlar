/**
 * Test hook: lets smoke tests drive a game through state instead of pixel clicks.
 * Installed as `window.__OYUN__` ONLY when the URL has `?test=1`. Pure, no Phaser.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface TestState {
  /** True once the first game scene after boot has finished create(). */
  ready: boolean;
  /** Key of the top-most registered (running) scene, e.g. 'menu' | 'game' | 'result' | 'pause'. */
  scene: string | null;
  /** Every registered scene, bottom to top. */
  scenes: string[];
  /** Global info from core: seed, lang, platform, muted. */
  meta: JsonObject;
  /** The top scene's own testState(). */
  data: JsonObject;
}

export interface OyunTestApi {
  readonly ready: boolean;
  state(): TestState;
  /**
   * Run a named action on the top-most scene that defines it. Actions must go through the same
   * code path as real input (call the tap handler, do not set fields). Throws on unknown names.
   */
  act(name: string, payload?: unknown): void;
  /** Names of every action currently available. */
  actions(): string[];
}

export interface TestProvider {
  state?: () => JsonObject;
  actions?: Readonly<Record<string, (payload: unknown) => void>>;
}

export interface TestHook {
  readonly api: OyunTestApi;
  /** Register a scene's provider (moves it to the top). Returns unregister. */
  register(sceneKey: string, provider: TestProvider): () => void;
  setMeta(meta: () => JsonObject): void;
  setReady(): void;
}

export interface TestParams {
  enabled: boolean;
  /** Integer from `&seed=N`, else null. */
  seed: number | null;
}

export function parseTestParams(search: string): TestParams {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return { enabled: params.get('test') === '1', seed: Number.isInteger(n) ? n : null };
}

export function createTestHook(): TestHook {
  const stack: { key: string; provider: TestProvider }[] = [];
  let ready = false;
  let meta: () => JsonObject = () => ({});

  const api: OyunTestApi = {
    get ready() {
      return ready;
    },
    state() {
      const top = stack[stack.length - 1];
      return {
        ready,
        scene: top?.key ?? null,
        scenes: stack.map((s) => s.key),
        meta: meta(),
        data: top?.provider.state?.() ?? {},
      };
    },
    act(name, payload) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const fn = stack[i]?.provider.actions?.[name];
        if (fn) {
          fn(payload);
          return;
        }
      }
      throw new Error(`__OYUN__.act: unknown action "${name}" (available: ${api.actions().join(', ') || 'none'})`);
    },
    actions() {
      const names = new Set<string>();
      for (const s of stack) for (const n of Object.keys(s.provider.actions ?? {})) names.add(n);
      return [...names];
    },
  };

  return {
    api,
    register(key, provider) {
      const existing = stack.findIndex((s) => s.key === key);
      if (existing >= 0) stack.splice(existing, 1);
      const entry = { key, provider };
      stack.push(entry);
      return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    setMeta(fn) {
      meta = fn;
    },
    setReady() {
      ready = true;
    },
  };
}

/** Puts `hook.api` on `target.__OYUN__` when enabled. */
export function installTestHook(target: object, hook: TestHook, enabled: boolean): void {
  if (!enabled) return;
  Object.defineProperty(target, '__OYUN__', { value: hook.api, configurable: true, enumerable: false, writable: false });
}

declare global {
  interface Window {
    __OYUN__?: OyunTestApi;
  }
}

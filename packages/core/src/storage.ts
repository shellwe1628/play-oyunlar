/**
 * Synchronous key/value storage. Web uses localStorage; when that is missing or throws
 * (Safari private mode, sandboxed portal iframes) we fall back to memory so the game still runs.
 * A future Capacitor Preferences adapter must also satisfy this sync interface (hydrate into
 * memory before the game boots, write through asynchronously).
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/** localStorage when it works, otherwise memory. Never throws. */
export function webStorage(): StorageAdapter {
  try {
    const ls = globalThis.localStorage;
    const probe = '__oyun_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (key) => ls.getItem(key),
      setItem: (key, value) => ls.setItem(key, value),
      removeItem: (key) => ls.removeItem(key),
    };
  } catch {
    return memoryStorage();
  }
}

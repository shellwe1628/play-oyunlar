import { describe, expect, it } from 'vitest';
import { createSaveStore, type SaveOptions } from '../src/save';
import { memoryStorage, type StorageAdapter } from '../src/storage';

interface V2 {
  best: number;
  coins: number;
  name: string;
}

function options(storage: StorageAdapter, extra: Partial<SaveOptions<V2>> = {}): SaveOptions<V2> {
  return {
    key: 'oyun:test:save',
    version: 2,
    defaults: () => ({ best: 0, coins: 0, name: 'anon' }),
    migrations: {
      // v1 stored { highScore } only
      1: (old) => {
        const o = old as { highScore?: number };
        return { best: o.highScore ?? 0, coins: 0, name: 'anon' };
      },
    },
    storage,
    ...extra,
  };
}

describe('save store', () => {
  it('returns defaults and status "fresh" when nothing is stored', () => {
    const store = createSaveStore(options(memoryStorage()));
    expect(store.data).toEqual({ best: 0, coins: 0, name: 'anon' });
    expect(store.status).toBe('fresh');
  });

  it('round-trips data through storage with a version stamp', () => {
    const storage = memoryStorage();
    const a = createSaveStore(options(storage));
    a.update((d) => {
      d.best = 12;
    });
    const raw = JSON.parse(storage.getItem('oyun:test:save') ?? 'null') as { v: number };
    expect(raw.v).toBe(2);
    const b = createSaveStore(options(storage));
    expect(b.data.best).toBe(12);
    expect(b.status).toBe('loaded');
  });

  it('migrates older versions step by step and rewrites at the current version', () => {
    const storage = memoryStorage();
    storage.setItem('oyun:test:save', JSON.stringify({ v: 1, data: { highScore: 33 } }));
    const store = createSaveStore(options(storage));
    expect(store.status).toBe('migrated');
    expect(store.data.best).toBe(33);
    const raw = JSON.parse(storage.getItem('oyun:test:save') ?? 'null') as { v: number };
    expect(raw.v).toBe(2);
  });

  it('fills fields added to defaults without a version bump', () => {
    const storage = memoryStorage();
    storage.setItem('oyun:test:save', JSON.stringify({ v: 2, data: { best: 5, coins: 1 } }));
    const store = createSaveStore(options(storage));
    expect(store.data).toEqual({ best: 5, coins: 1, name: 'anon' });
  });

  it('recovers from a corrupt primary using the backup of the previous save', () => {
    const storage = memoryStorage();
    const a = createSaveStore(options(storage));
    a.update((d) => {
      d.best = 7;
    });
    a.update((d) => {
      d.best = 9;
    }); // backup now holds best = 7
    storage.setItem('oyun:test:save', '{"v":2,"data":{"be'); // truncated write
    const b = createSaveStore(options(storage));
    expect(b.status).toBe('recovered');
    expect(b.data.best).toBe(7);
  });

  it('resets to defaults when primary and backup are both unusable, keeping the raw text', () => {
    const storage = memoryStorage();
    storage.setItem('oyun:test:save', 'not json');
    storage.setItem('oyun:test:save.bak', '[]');
    const store = createSaveStore(options(storage));
    expect(store.status).toBe('reset');
    expect(store.data).toEqual({ best: 0, coins: 0, name: 'anon' });
    expect(storage.getItem('oyun:test:save.corrupt')).toBe('not json');
  });

  it('treats a failing validate() as corruption', () => {
    const storage = memoryStorage();
    storage.setItem('oyun:test:save', JSON.stringify({ v: 2, data: { best: 'lots' } }));
    const store = createSaveStore(
      options(storage, {
        validate: (d): d is V2 => typeof (d as V2).best === 'number',
      }),
    );
    expect(store.status).toBe('reset');
    expect(store.data.best).toBe(0);
  });

  it('treats a throwing migration as corruption', () => {
    const storage = memoryStorage();
    storage.setItem('oyun:test:save', JSON.stringify({ v: 1, data: {} }));
    const store = createSaveStore(
      options(storage, {
        migrations: {
          1: () => {
            throw new Error('boom');
          },
        },
      }),
    );
    expect(store.status).toBe('reset');
  });

  it('refuses a save from a newer version and never overwrites it', () => {
    const storage = memoryStorage();
    const newer = JSON.stringify({ v: 9, data: { best: 999 } });
    storage.setItem('oyun:test:save', newer);
    const store = createSaveStore(options(storage));
    expect(store.status).toBe('newer');
    expect(store.readOnly).toBe(true);
    expect(store.update((d) => void (d.best = 1))).toBe(false);
    expect(storage.getItem('oyun:test:save')).toBe(newer);
    expect(store.data.best).toBe(1); // in-memory play still works
  });

  it('reports a failed write instead of throwing (quota, private mode)', () => {
    const failing: StorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const errors: unknown[] = [];
    const store = createSaveStore(options(failing, { onError: (e) => errors.push(e) }));
    expect(store.save()).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('reset() restores defaults and persists them', () => {
    const storage = memoryStorage();
    const store = createSaveStore(options(storage));
    store.update((d) => void (d.coins = 50));
    store.reset();
    expect(store.data.coins).toBe(0);
    expect(createSaveStore(options(storage)).data.coins).toBe(0);
  });

  it('rejects an invalid version number at creation', () => {
    expect(() => createSaveStore(options(memoryStorage(), { version: 0 }))).toThrow();
    expect(() => createSaveStore(options(memoryStorage(), { version: 1.5 }))).toThrow();
  });
});

describe('memoryStorage', () => {
  it('behaves like a minimal Storage', () => {
    const s = memoryStorage();
    expect(s.getItem('a')).toBeNull();
    s.setItem('a', '1');
    expect(s.getItem('a')).toBe('1');
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
  });
});

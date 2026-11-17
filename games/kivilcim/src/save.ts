import type { OyunContext } from '@oyun/core';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { defaults, migrateV2, normalize, type SaveData } from './sim/progress';

/**
 * Save schema version. v1 was the template's { best, rounds } (no game progress to keep);
 * v2 is Sparkrise's slice progress (10 levels); v3 adds worlds 2-4, stars, ranks, achievements
 * and records. Keep every migration forever.
 */
export const SAVE_VERSION = 3;

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<SaveData> {
  return {
    key: `oyun:${gameId}:save`,
    version: SAVE_VERSION,
    defaults,
    migrations: {
      1: () => defaults(),
      2: migrateV2,
    },
    validate: normalize,
    storage,
    onError: (e) => console.warn('[save]', e),
  };
}

const stores = new WeakMap<StorageAdapter, SaveStore<SaveData>>();

/** The game's save store (one per storage adapter). */
export function gameSave(ctx: OyunContext): SaveStore<SaveData> {
  let store = stores.get(ctx.storage);
  if (!store) {
    store = createSaveStore(saveOptions(ctx.storage, ctx.info.id));
    stores.set(ctx.storage, store);
  }
  return store;
}

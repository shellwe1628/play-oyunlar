import type { OyunContext } from '@oyun/core';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { defaultSave, migrateV1, migrateV2, type DigSave } from './sim/dig';

/**
 * Save schema version. Bump it (and add a migration) when a field is renamed, removed or
 * changes type. Adding a field only needs a default in defaultSave(). The DigSim constructor
 * repairs bad values (sanitizeSave), so validation here only rejects the wrong overall shape.
 */
export const SAVE_VERSION = 3;

/**
 * v1 → v2: ten layers, museum, expeditions, records (see migrateV1).
 * v2 → v3: thirteen layers, star-core and echo counters, the depth-round news (see migrateV2).
 * Keep every step forever.
 */
export const MIGRATIONS: Readonly<Record<number, (data: unknown) => unknown>> = { 1: migrateV1, 2: migrateV2 };

function isSave(d: unknown): d is DigSave {
  if (typeof d !== 'object' || d === null) return false;
  const s = d as Partial<DigSave>;
  return (
    typeof s.dust === 'number' &&
    typeof s.counts === 'object' &&
    s.counts !== null &&
    !Array.isArray(s.counts) &&
    typeof s.levels === 'object' &&
    s.levels !== null &&
    Array.isArray(s.broken)
  );
}

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<DigSave> {
  return {
    key: `oyun:${gameId}:save`,
    version: SAVE_VERSION,
    defaults: defaultSave,
    migrations: MIGRATIONS,
    validate: isSave,
    storage,
    onError: (e) => console.warn('[save]', e),
  };
}

const stores = new WeakMap<StorageAdapter, SaveStore<DigSave>>();

/** The game's save store (one per storage adapter). */
export function gameSave(ctx: OyunContext): SaveStore<DigSave> {
  let store = stores.get(ctx.storage);
  if (!store) {
    store = createSaveStore(saveOptions(ctx.storage, ctx.info.id));
    stores.set(ctx.storage, store);
  }
  return store;
}

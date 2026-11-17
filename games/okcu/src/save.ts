import type { OyunContext } from '@oyun/core';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { freshSave, UPGRADE_IDS, type SaveData } from './sim/meta';

/**
 * Save schema version. Bump it (and add a migration) when a field is renamed, removed or
 * changes type. Adding a field only needs a default in freshSave().
 */
export const SAVE_VERSION = 2;

/**
 * Fill every upgrade id the stored save lacks with 0 (an upgrade added in a later version,
 * or a hand-edited save). Never resets coins or best wave for a missing key.
 */
export function mergeUpgrades(d: Partial<SaveData>): SaveData {
  const base = freshSave();
  const ups = (typeof d.upgrades === 'object' && d.upgrades !== null ? d.upgrades : {}) as Partial<Record<string, unknown>>;
  const upgrades = { ...base.upgrades };
  for (const id of UPGRADE_IDS) {
    const v = ups[id];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) upgrades[id] = Math.floor(v);
  }
  return { ...base, ...d, upgrades };
}

function valid(d: unknown): d is SaveData {
  if (typeof d !== 'object' || d === null) return false;
  const s = d as SaveData;
  if (!Number.isFinite(s.best) || !Number.isFinite(s.coins) || s.coins < 0) return false;
  // upgrades are repaired by mergeUpgrades, never a reason to throw the save away
  return typeof s.upgrades === 'object' && s.upgrades !== null;
}

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<SaveData> {
  return {
    key: `oyun:${gameId}:save`,
    version: SAVE_VERSION,
    defaults: freshSave,
    migrations: {
      // v1 → v2: upgrades merged over defaults (v1 dropped saves missing an upgrade id)
      1: (old) => mergeUpgrades(old as Partial<SaveData>),
    },
    validate: valid,
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
    // additive upgrade ids (same version) are filled in memory and written with the next update
    const fixed = mergeUpgrades(store.data);
    Object.assign(store.data.upgrades, fixed.upgrades);
    stores.set(ctx.storage, store);
  }
  return store;
}

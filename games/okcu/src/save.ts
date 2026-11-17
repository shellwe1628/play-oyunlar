import type { OyunContext } from '@oyun/core';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { BOW_MAX, bowLevelForOldDamage } from './sim/bow';
import { freshRecords, freshSave, UPGRADE_IDS, type DatedRecord, type SaveData } from './sim/meta';

/**
 * Save schema version. Bump it (and add a migration) when a field is renamed, removed or
 * changes type. Adding a field only needs a default in freshSave() (repair fills it in).
 * v3: the shop's damage upgrade became the forged bow (`upgrades.dmg` → `bow.level`).
 */
export const SAVE_VERSION = 3;

const num = (v: unknown, lo = 0): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo ? v : null);

function record(v: unknown): DatedRecord {
  const r = (typeof v === 'object' && v !== null ? v : {}) as Partial<DatedRecord>;
  return { n: num(r.n) ?? 0, date: typeof r.date === 'string' ? r.date : '' };
}

/**
 * Fill every field the stored save lacks with its default (an upgrade added in a later
 * version, the progress fields of v3, or a hand-edited save). Never resets coins or best.
 */
export function repairSave(d: Partial<SaveData>): SaveData {
  const base = freshSave();
  const ups = (typeof d.upgrades === 'object' && d.upgrades !== null ? d.upgrades : {}) as Partial<Record<string, unknown>>;
  const upgrades = { ...base.upgrades };
  for (const id of UPGRADE_IDS) {
    const v = num(ups[id]);
    if (v !== null) upgrades[id] = Math.floor(v);
  }
  const b = (typeof d.bow === 'object' && d.bow !== null ? d.bow : {}) as Partial<SaveData['bow']>;
  const bow = { level: Math.min(BOW_MAX, Math.floor(num(b.level) ?? 0)), heat: Math.min(1, num(b.heat) ?? 0), tries: Math.floor(num(b.tries) ?? 0) };
  const rec = (typeof d.records === 'object' && d.records !== null ? d.records : {}) as Partial<SaveData['records']>;
  const fr = freshRecords();
  const records = {
    chapter: fr.chapter.map((_, i) => record(rec.chapter?.[i])),
    bossTime: fr.bossTime.map((_, i) => record(rec.bossTime?.[i])),
    headChain: record(rec.headChain),
    streak: record(rec.streak),
    runKos: record(rec.runKos),
    endless: record(rec.endless),
  };
  const bosses = base.bosses.map((_, i) => Math.floor(num(Array.isArray(d.bosses) ? d.bosses[i] : undefined) ?? 0));
  const feats = Array.isArray(d.feats) ? d.feats.filter((f): f is string => typeof f === 'string') : [];
  return { ...base, ...d, upgrades, bow, records, bosses, feats };
}

/** Kept for older tests and callers: the same repair. */
export const mergeUpgrades = repairSave;

/**
 * v2 → v3: each level of the old "base damage" upgrade (+10 % per level) becomes the lowest bow
 * level with at least that damage (8 levels, +80 %, become +10, also +80 %), so nobody loses
 * damage; the coins and everything else stay.
 */
export function migrateV2(old: unknown): SaveData {
  const d = (typeof old === 'object' && old !== null ? old : {}) as Partial<SaveData> & { upgrades?: Record<string, unknown> };
  const dmg = Math.floor(num(d.upgrades?.dmg) ?? 0);
  const s = repairSave(d);
  s.bow.level = Math.max(s.bow.level, bowLevelForOldDamage(dmg));
  return s;
}

function valid(d: unknown): d is SaveData {
  if (typeof d !== 'object' || d === null) return false;
  const s = d as SaveData;
  if (!Number.isFinite(s.best) || !Number.isFinite(s.coins) || s.coins < 0) return false;
  // missing fields are repaired by repairSave, never a reason to throw the save away
  return typeof s.upgrades === 'object' && s.upgrades !== null;
}

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<SaveData> {
  return {
    key: `oyun:${gameId}:save`,
    version: SAVE_VERSION,
    defaults: freshSave,
    migrations: {
      // v1 → v2: upgrades merged over defaults (v1 dropped saves missing an upgrade id); the
      // old damage level is kept as it is so the v2 → v3 step can turn it into bow levels
      1: (old) => old,
      // v2 → v3: the damage upgrade becomes bow levels
      2: (old) => migrateV2(old),
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
    // additive fields (same version) are filled in memory and written with the next update
    Object.assign(store.data, repairSave(store.data));
    stores.set(ctx.storage, store);
  }
  return store;
}

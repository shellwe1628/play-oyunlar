import type { StorageAdapter } from './storage';

/**
 * Versioned save with migrations, backup and corrupt-save recovery. Pure, no Phaser.
 *
 * Stored as JSON `{ "v": <version>, "data": <T> }` under `key`; the previous good save is kept
 * under `key + ".bak"`. Unreadable text is copied to `key + ".corrupt"` before a reset.
 */
export type SaveStatus =
  /** nothing stored yet: defaults */
  | 'fresh'
  /** stored save read at the current version */
  | 'loaded'
  /** stored save was older and went through the migration chain */
  | 'migrated'
  /** primary was unusable, the backup was loaded */
  | 'recovered'
  /** primary and backup unusable: defaults (raw text kept under `.corrupt`) */
  | 'reset'
  /** save written by a newer build: defaults in memory, storage is never overwritten */
  | 'newer';

export interface SaveOptions<T extends object> {
  /** Full storage key. Convention: `oyun:<game-id>:save`. */
  key: string;
  /** Current schema version, integer >= 1. Bump it when a field is renamed, removed or retyped. */
  version: number;
  /** Fresh data. Also used to fill fields missing from older saves (additive changes need no bump). */
  defaults: () => T;
  /** `migrations[n]` turns version n data into version n+1 data. Keep every one forever. */
  migrations?: Readonly<Record<number, (data: unknown) => unknown>>;
  /** Extra check after migration + default filling. Return false to treat the save as corrupt. */
  validate?: (data: unknown) => data is T;
  storage: StorageAdapter;
  /** Called on write failures and on recovery (for logging/analytics). */
  onError?: (error: unknown) => void;
}

export interface SaveStore<T extends object> {
  /** Current data. Mutate only through update(). */
  readonly data: T;
  readonly status: SaveStatus;
  /** True after a `newer` load: writes are refused to protect the newer save. */
  readonly readOnly: boolean;
  /** Persist current data. Returns false when the write failed or the store is read-only. */
  save(): boolean;
  /** Mutate data then persist. Returns the save() result; data changes in memory either way. */
  update(mutator: (data: T) => void): boolean;
  /** Back to defaults, persisted. */
  reset(): boolean;
}

interface Envelope {
  v: number;
  data: unknown;
}

type ReadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; data: unknown; migrated: boolean }
  | { kind: 'newer' }
  | { kind: 'bad'; raw: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is Envelope {
  return isPlainObject(value) && Number.isInteger(value.v) && (value.v as number) >= 1 && 'data' in value;
}

export function createSaveStore<T extends object>(opts: SaveOptions<T>): SaveStore<T> {
  if (!Number.isInteger(opts.version) || opts.version < 1) {
    throw new Error(`save: version must be an integer >= 1, got ${String(opts.version)}`);
  }
  const backupKey = `${opts.key}.bak`;
  const corruptKey = `${opts.key}.corrupt`;
  const report = (e: unknown): void => opts.onError?.(e);

  const finish = (data: unknown): T | undefined => {
    if (!isPlainObject(data)) return undefined;
    const filled = { ...opts.defaults(), ...data } as unknown;
    if (opts.validate && !opts.validate(filled)) return undefined;
    return filled as T;
  };

  const read = (key: string): ReadResult => {
    let raw: string | null;
    try {
      raw = opts.storage.getItem(key);
    } catch (e) {
      report(e);
      return { kind: 'empty' };
    }
    if (raw === null) return { kind: 'empty' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: 'bad', raw };
    }
    if (!isEnvelope(parsed)) return { kind: 'bad', raw };
    if (parsed.v > opts.version) return { kind: 'newer' };
    let data = parsed.data;
    try {
      for (let v = parsed.v; v < opts.version; v++) {
        const step = opts.migrations?.[v];
        if (!step) throw new Error(`save: no migration from v${v}`);
        data = step(data);
      }
    } catch (e) {
      report(e);
      return { kind: 'bad', raw };
    }
    const done = finish(data);
    if (done === undefined) return { kind: 'bad', raw };
    return { kind: 'ok', data: done, migrated: parsed.v < opts.version };
  };

  let data: T;
  let status: SaveStatus;
  let readOnly = false;
  let needsWrite = false;

  const primary = read(opts.key);
  if (primary.kind === 'ok') {
    data = primary.data as T;
    status = primary.migrated ? 'migrated' : 'loaded';
    needsWrite = primary.migrated;
  } else if (primary.kind === 'empty') {
    data = opts.defaults();
    status = 'fresh';
  } else if (primary.kind === 'newer') {
    data = opts.defaults();
    status = 'newer';
    readOnly = true;
  } else {
    const backup = read(backupKey);
    try {
      opts.storage.setItem(corruptKey, primary.raw);
    } catch (e) {
      report(e);
    }
    if (backup.kind === 'ok') {
      data = backup.data as T;
      status = 'recovered';
    } else {
      data = opts.defaults();
      status = 'reset';
    }
    report(new Error(`save: primary unreadable, status=${status}`));
    needsWrite = true;
  }

  const save = (): boolean => {
    if (readOnly) return false;
    try {
      const previous = opts.storage.getItem(opts.key);
      if (previous !== null && read(opts.key).kind === 'ok') {
        opts.storage.setItem(backupKey, previous);
      }
      const envelope: Envelope = { v: opts.version, data };
      opts.storage.setItem(opts.key, JSON.stringify(envelope));
      return true;
    } catch (e) {
      report(e);
      return false;
    }
  };

  if (needsWrite) save();

  return {
    get data() {
      return data;
    },
    get status() {
      return status;
    },
    get readOnly() {
      return readOnly;
    },
    save,
    update(mutator) {
      mutator(data);
      return save();
    },
    reset() {
      data = opts.defaults();
      return save();
    },
  };
}

/**
 * Which species the player has already looked at in the museum. Presentation-only memory, kept
 * outside the game save (like the set celebrations): it only decides where a "New!" ribbon and
 * the museum button's badge show. Losing it costs nothing but a few extra ribbons.
 */
import type { OyunContext } from '@oyun/core';

const KEY = 'oyun:fosil:fx-seen';

/** The stored set, or null when nothing was ever stored (or it cannot be read). */
export function loadSeen(oyun: OyunContext): Set<string> | null {
  try {
    const raw = oyun.storage.getItem(KEY);
    if (raw === null) return null;
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? new Set(list.filter((x): x is string => typeof x === 'string')) : null;
  } catch {
    return null;
  }
}

function store(oyun: OyunContext, seen: ReadonlySet<string>): void {
  try {
    oyun.storage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* presentation-only memory */
  }
}

/**
 * First run of this memory: everything found so far counts as seen, so a collection from before
 * this round is not suddenly covered in ribbons. Returns the set in use.
 */
export function initSeen(oyun: OyunContext, discovered: readonly string[]): Set<string> {
  const have = loadSeen(oyun);
  if (have) return have;
  const seen = new Set(discovered);
  store(oyun, seen);
  return seen;
}

/** Remember these species as seen. */
export function markSeen(oyun: OyunContext, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const seen = loadSeen(oyun) ?? new Set<string>();
  let changed = false;
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      changed = true;
    }
  }
  if (changed) store(oyun, seen);
}

/**
 * When to ask GitHub again. The record lives in sessionStorage: it is shared by the launcher and
 * the game pages of one app run (same origin, same WebView) and is gone when Android starts the
 * app afresh. So: a new app start always checks; moving between pages reuses a recent result;
 * returning to the foreground checks again once MIN_INTERVAL_MS has passed. "Later" sets
 * `dismissed` for the rest of the run.
 */
import type { ManifestApp } from './manifest';

export const MIN_INTERVAL_MS = 5 * 60_000;
export const RECORD_KEY = 'oyun:test-update:session';

export interface SessionRecord {
  checkedAt: number;
  /** Newer version found at checkedAt (already validated), or null. */
  offer: ManifestApp | null;
  dismissed: boolean;
}

export function needsCheck(rec: SessionRecord | null, now: number): boolean {
  return !rec || now - rec.checkedAt >= MIN_INTERVAL_MS || now < rec.checkedAt;
}

export function parseRecord(text: string | null): SessionRecord | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<SessionRecord> | null;
    if (!v || typeof v.checkedAt !== 'number' || typeof v.dismissed !== 'boolean' || (v.offer !== null && typeof v.offer !== 'object')) return null;
    return { checkedAt: v.checkedAt, offer: v.offer ?? null, dismissed: v.dismissed };
  } catch {
    return null;
  }
}

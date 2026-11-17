/**
 * The update prompt as a pure state machine. ui.ts renders the state and runs the effect that
 * belongs to each transition (effectOf); native results come back as events. A tap while
 * something is already running returns the same state object, so it starts nothing.
 */
import { checkDownload, type ManifestApp } from './manifest';

export type FailReason = 'offline' | 'interrupted' | 'server' | 'size' | 'checksum' | 'storage' | 'permission' | 'cancelled' | 'install';

export type State =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'available'; offer: ManifestApp }
  | { kind: 'checkingPermission'; offer: ManifestApp }
  | { kind: 'needPermission'; offer: ManifestApp }
  | { kind: 'awaitingSettings'; offer: ManifestApp }
  | { kind: 'downloading'; offer: ManifestApp; received: number; total: number }
  | { kind: 'installing'; offer: ManifestApp }
  | { kind: 'failed'; offer: ManifestApp; reason: FailReason };

export type Event =
  | { type: 'offer'; offer: ManifestApp }
  | { type: 'update' }
  | { type: 'later' }
  | { type: 'permission'; granted: boolean }
  | { type: 'openSettings' }
  | { type: 'settingsReturned'; granted: boolean }
  | { type: 'progress'; received: number; total: number }
  | { type: 'downloaded'; bytes: number; sha256: string }
  | { type: 'downloadFailed'; code: string }
  | { type: 'installResult'; result: 'installed' | 'cancelled' | 'failed' };

/** What ui.ts must do after a transition. */
export type Effect = 'queryPermission' | 'openSettings' | 'download' | 'install' | 'dismiss';

export const initial: State = { kind: 'idle' };

/** Native error codes (TestUpdatePlugin.java) → reason shown to the user. */
const DOWNLOAD_CODES: Record<string, FailReason> = {
  NETWORK: 'offline',
  INTERRUPTED: 'interrupted',
  HTTP: 'server',
  SIZE: 'size',
  CHECKSUM: 'checksum',
  STORAGE: 'storage',
};

const downloading = (offer: ManifestApp): State => ({ kind: 'downloading', offer, received: 0, total: offer.size });

export function reduce(s: State, e: Event): State {
  if (s.kind === 'hidden') return s;
  switch (e.type) {
    case 'offer':
      if (s.kind === 'idle') return { kind: 'available', offer: e.offer };
      if ((s.kind === 'available' || s.kind === 'failed') && e.offer.versionCode > s.offer.versionCode) return { kind: 'available', offer: e.offer };
      return s;
    case 'update':
      return s.kind === 'available' || s.kind === 'failed' ? { kind: 'checkingPermission', offer: s.offer } : s;
    case 'later':
      return s.kind === 'available' || s.kind === 'failed' || s.kind === 'needPermission' ? { kind: 'hidden' } : s;
    case 'permission':
      if (s.kind !== 'checkingPermission') return s;
      return e.granted ? downloading(s.offer) : { kind: 'needPermission', offer: s.offer };
    case 'openSettings':
      return s.kind === 'needPermission' ? { kind: 'awaitingSettings', offer: s.offer } : s;
    case 'settingsReturned':
      if (s.kind !== 'awaitingSettings') return s;
      return e.granted ? downloading(s.offer) : { kind: 'failed', offer: s.offer, reason: 'permission' };
    case 'progress':
      return s.kind === 'downloading' ? { ...s, received: e.received, total: e.total > 0 ? e.total : s.total } : s;
    case 'downloaded': {
      if (s.kind !== 'downloading') return s;
      const verdict = checkDownload(s.offer, e);
      return verdict === 'ok' ? { kind: 'installing', offer: s.offer } : { kind: 'failed', offer: s.offer, reason: verdict };
    }
    case 'downloadFailed':
      return s.kind === 'downloading' ? { kind: 'failed', offer: s.offer, reason: DOWNLOAD_CODES[e.code] ?? 'interrupted' } : s;
    case 'installResult':
      if (s.kind !== 'installing') return s;
      if (e.result === 'installed') return { kind: 'hidden' };
      return { kind: 'failed', offer: s.offer, reason: e.result === 'cancelled' ? 'cancelled' : 'install' };
  }
}

export function effectOf(prev: State, next: State): Effect | null {
  if (prev === next || prev.kind === next.kind) return null;
  switch (next.kind) {
    case 'checkingPermission':
      return 'queryPermission';
    case 'awaitingSettings':
      return 'openSettings';
    case 'downloading':
      return 'download';
    case 'installing':
      return 'install';
    case 'hidden':
      return prev.kind === 'installing' ? null : 'dismiss';
    default:
      return null;
  }
}

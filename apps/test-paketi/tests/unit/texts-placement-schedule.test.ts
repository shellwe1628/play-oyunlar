import { describe, expect, it } from 'vitest';
import { pickLang } from '../../src/lang';
import { initial, reduce, type State } from '../../src/update/machine';
import type { ManifestApp } from '../../src/update/manifest';
import { IDLE_MS, MARGIN, placeBanner } from '../../src/update/placement';
import { MIN_INTERVAL_MS, needsCheck, parseRecord } from '../../src/update/schedule';
import { describeState } from '../../src/update/texts';

const offer: ManifestApp = {
  applicationId: 'com.playoyunlar.testpaketi',
  versionCode: 462000,
  versionName: 'test-2026-11-17-abc1234',
  file: 'play-oyunlar-test-462000.apk',
  size: 5 * 1024 * 1024,
  sha256: 'e'.repeat(64),
  builtAt: '2026-11-17T20:00:00.000Z',
  notes: 'Sparkrise: faster restart',
};
const available = reduce(initial, { type: 'offer', offer });

describe('texts', () => {
  it('English: "New test version available — Update" with the what-changed line and Later', () => {
    const v = describeState(available, 'en');
    expect(v?.title).toBe('New test version available');
    expect(v?.body).toContain('Sparkrise: faster restart');
    expect(v?.actions.map((a) => [a.event, a.label])).toEqual([
      ['update', 'Update'],
      ['later', 'Later'],
    ]);
  });

  it('Turkish texts', () => {
    const v = describeState(available, 'tr');
    expect(v?.title).toBe('Yeni test sürümü var');
    expect(v?.actions.map((a) => a.label)).toEqual(['Güncelle', 'Sonra']);
  });

  it('nothing is shown when idle or hidden', () => {
    expect(describeState(initial, 'en')).toBeNull();
    expect(describeState(reduce(available, { type: 'later' }), 'tr')).toBeNull();
  });

  it('the permission step explains Android’s screen before sending the user there', () => {
    const s = [{ type: 'update' }, { type: 'permission', granted: false }].reduce(reduce as (s: State, e: never) => State, available);
    const en = describeState(s, 'en');
    expect(en?.body).toMatch(/Allow from this source/);
    expect(en?.actions.map((a) => a.event)).toEqual(['openSettings', 'later']);
    expect(describeState(s, 'tr')?.body).toMatch(/Bu kaynaktan izin ver/);
  });

  it('download shows a percentage and announces Android’s "Update this app?" question', () => {
    const s = reduce(reduce(reduce(available, { type: 'update' }), { type: 'permission', granted: true }), { type: 'progress', received: 2.5 * 1024 * 1024, total: 5 * 1024 * 1024 });
    const v = describeState(s, 'en');
    expect(v?.progress).toBeCloseTo(0.5);
    expect(v?.title).toContain('50%');
    expect(v?.body).toMatch(/update this app\?/i);
    expect(v?.actions).toEqual([]);
  });

  it('every failure has a readable message and a retry', () => {
    for (const code of ['NETWORK', 'INTERRUPTED', 'HTTP', 'SIZE', 'CHECKSUM', 'STORAGE']) {
      const s = reduce(reduce(reduce(available, { type: 'update' }), { type: 'permission', granted: true }), { type: 'downloadFailed', code });
      for (const lang of ['en', 'tr'] as const) {
        const v = describeState(s, lang);
        expect(v?.tone).toBe('error');
        expect(v?.body.length).toBeGreaterThan(10);
        expect(v?.actions.map((a) => a.event)).toEqual(['update', 'later']);
      }
    }
    const bad = reduce(reduce(reduce(available, { type: 'update' }), { type: 'permission', granted: true }), { type: 'downloadFailed', code: 'CHECKSUM' });
    expect(describeState(bad, 'en')?.body).toMatch(/check/i);
  });
});

describe('placeBanner', () => {
  const viewport = { width: 390, height: 844 };
  const insets = { top: 24, bottom: 16 };
  // 720×1280 FIT into 390×844: 390×693, centred → 75.3 px letterbox above and below.
  const canvas = { top: 75.3, bottom: 768.7, left: 0, right: 390 };
  const base = { viewport, insets, canvas, height: 48, idleMs: 0, pointerHeld: false, engaged: false };

  it('launcher (no game canvas): at the top, below the status bar', () => {
    expect(placeBanner({ ...base, canvas: null })).toEqual({ mode: 'top', top: 24 + MARGIN });
  });

  it('game with room in the bottom letterbox: entirely outside the play area, even mid-run', () => {
    const p = placeBanner({ ...base, pointerHeld: true });
    expect(p.mode).toBe('letterbox');
    expect(p.top).toBeGreaterThanOrEqual(canvas.bottom);
    expect(p.top + base.height).toBeLessThanOrEqual(viewport.height - insets.bottom);
  });

  it('falls back to the top letterbox when only that one has room', () => {
    const p = placeBanner({ ...base, canvas: { ...canvas, top: 110, bottom: 844 - 20 }, insets: { top: 24, bottom: 16 } });
    expect(p.mode).toBe('letterbox');
    expect(p.top).toBeGreaterThanOrEqual(24);
    expect(p.top + base.height).toBeLessThanOrEqual(110);
  });

  it('no letterbox room: waits while the player is touching or was touching recently', () => {
    const full = { ...canvas, top: 0, bottom: 844 };
    expect(placeBanner({ ...base, canvas: full, pointerHeld: true, idleMs: 60_000 }).mode).toBe('wait');
    expect(placeBanner({ ...base, canvas: full, idleMs: IDLE_MS - 1 }).mode).toBe('wait');
    expect(placeBanner({ ...base, canvas: full, idleMs: IDLE_MS })).toEqual({ mode: 'overlay', top: 24 + MARGIN });
  });

  it('once the player is using the banner (download, permission…), it stays put', () => {
    const full = { ...canvas, top: 0, bottom: 844 };
    expect(placeBanner({ ...base, canvas: full, pointerHeld: true, engaged: true }).mode).toBe('overlay');
  });
});

describe('check schedule', () => {
  it('checks on a fresh app start, reuses a recent result between pages, re-checks after the interval', () => {
    expect(needsCheck(null, 1000)).toBe(true);
    const rec = { checkedAt: 1000, offer: null, dismissed: false };
    expect(needsCheck(rec, 1000 + MIN_INTERVAL_MS - 1)).toBe(false);
    expect(needsCheck(rec, 1000 + MIN_INTERVAL_MS)).toBe(true);
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('ignores a corrupt session record', () => {
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord('{nope')).toBeNull();
    expect(parseRecord(JSON.stringify({ checkedAt: 'x' }))).toBeNull();
    expect(parseRecord(JSON.stringify({ checkedAt: 5, offer: null, dismissed: true }))).toEqual({ checkedAt: 5, offer: null, dismissed: true });
  });
});

describe('pickLang', () => {
  it('device language tr → tr, anything else → en, ?lang wins', () => {
    expect(pickLang(['tr-TR'], null)).toBe('tr');
    expect(pickLang(['de-DE', 'en-US'], null)).toBe('en');
    expect(pickLang(['de-DE'], null)).toBe('en');
    expect(pickLang(['tr-TR'], 'en')).toBe('en');
  });
});

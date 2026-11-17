import { describe, expect, it } from 'vitest';
import { effectOf, initial, reduce, type Event, type State } from '../../src/update/machine';
import type { ManifestApp } from '../../src/update/manifest';

const SHA = 'c'.repeat(64);
const offer: ManifestApp = {
  applicationId: 'com.playoyunlar.testpaketi',
  versionCode: 462000,
  versionName: 'test-2026-11-17-abc1234',
  file: 'play-oyunlar-test-462000.apk',
  size: 1000,
  sha256: SHA,
  builtAt: '2026-11-17T20:00:00.000Z',
  notes: 'New launcher',
};
const run = (events: Event[], from: State = initial): State => events.reduce(reduce, from);
const available = run([{ type: 'offer', offer }]);

describe('update prompt state machine', () => {
  it('shows nothing until an offer arrives', () => {
    expect(initial.kind).toBe('idle');
    expect(run([{ type: 'update' }]).kind).toBe('idle');
  });

  it('offer → available; Update asks for the install permission first', () => {
    expect(available.kind).toBe('available');
    const s = reduce(available, { type: 'update' });
    expect(s.kind).toBe('checkingPermission');
    expect(effectOf(available, s)).toBe('queryPermission');
  });

  it('granted permission → download with progress → verified → installer', () => {
    const s1 = run([{ type: 'update' }, { type: 'permission', granted: true }], available);
    expect(s1.kind).toBe('downloading');
    const s2 = reduce(s1, { type: 'progress', received: 400, total: 1000 });
    expect(s2).toMatchObject({ kind: 'downloading', received: 400, total: 1000 });
    expect(effectOf(s1, s2)).toBeNull(); // progress never restarts the download
    const s3 = reduce(s2, { type: 'downloaded', bytes: 1000, sha256: SHA });
    expect(s3.kind).toBe('installing');
    expect(effectOf(s2, s3)).toBe('install');
  });

  it('missing permission → explain → settings → granted continues to the download', () => {
    const s1 = run([{ type: 'update' }, { type: 'permission', granted: false }], available);
    expect(s1.kind).toBe('needPermission');
    const s2 = reduce(s1, { type: 'openSettings' });
    expect(s2.kind).toBe('awaitingSettings');
    expect(effectOf(s1, s2)).toBe('openSettings');
    const s3 = reduce(s2, { type: 'settingsReturned', granted: true });
    expect(s3.kind).toBe('downloading');
    expect(effectOf(s2, s3)).toBe('download');
  });

  it('permission still refused after settings → failed(permission); Update retries the check', () => {
    const s = run([{ type: 'update' }, { type: 'permission', granted: false }, { type: 'openSettings' }, { type: 'settingsReturned', granted: false }], available);
    expect(s).toMatchObject({ kind: 'failed', reason: 'permission' });
    expect(reduce(s, { type: 'update' }).kind).toBe('checkingPermission');
  });

  it.each([
    ['NETWORK', 'offline'],
    ['INTERRUPTED', 'interrupted'],
    ['HTTP', 'server'],
    ['SIZE', 'size'],
    ['CHECKSUM', 'checksum'],
    ['STORAGE', 'storage'],
    ['SOMETHING_NEW', 'interrupted'],
  ])('download failure %s → failed(%s), retry possible', (code, reason) => {
    const s = run([{ type: 'update' }, { type: 'permission', granted: true }, { type: 'downloadFailed', code }], available);
    expect(s).toMatchObject({ kind: 'failed', reason });
    expect(reduce(s, { type: 'update' }).kind).toBe('checkingPermission');
  });

  it('a downloaded file whose checksum or size differs from the manifest is never installed', () => {
    const dl = run([{ type: 'update' }, { type: 'permission', granted: true }], available);
    expect(reduce(dl, { type: 'downloaded', bytes: 1000, sha256: 'd'.repeat(64) })).toMatchObject({ kind: 'failed', reason: 'checksum' });
    expect(reduce(dl, { type: 'downloaded', bytes: 999, sha256: SHA })).toMatchObject({ kind: 'failed', reason: 'size' });
  });

  it('backing out of the installer → failed(cancelled); Update tries again', () => {
    const inst = run([{ type: 'update' }, { type: 'permission', granted: true }, { type: 'downloaded', bytes: 1000, sha256: SHA }], available);
    const s = reduce(inst, { type: 'installResult', result: 'cancelled' });
    expect(s).toMatchObject({ kind: 'failed', reason: 'cancelled' });
    expect(reduce(inst, { type: 'installResult', result: 'failed' })).toMatchObject({ kind: 'failed', reason: 'install' });
    expect(reduce(s, { type: 'update' }).kind).toBe('checkingPermission');
  });

  it('tapping Update twice does not start a second download or installer', () => {
    const busy: State[] = [
      run([{ type: 'update' }], available),
      run([{ type: 'update' }, { type: 'permission', granted: true }], available),
      run([{ type: 'update' }, { type: 'permission', granted: false }, { type: 'openSettings' }], available),
      run([{ type: 'update' }, { type: 'permission', granted: true }, { type: 'downloaded', bytes: 1000, sha256: SHA }], available),
    ];
    for (const s of busy) {
      const again = reduce(s, { type: 'update' });
      expect(again).toBe(s);
      expect(effectOf(s, again)).toBeNull();
    }
  });

  it('Later hides the banner and remembers it; later offers stay hidden', () => {
    const s = reduce(available, { type: 'later' });
    expect(s.kind).toBe('hidden');
    expect(effectOf(available, s)).toBe('dismiss');
    expect(reduce(s, { type: 'offer', offer: { ...offer, versionCode: 999999 } }).kind).toBe('hidden');
    expect(reduce(reduce(run([{ type: 'update' }, { type: 'permission', granted: true }, { type: 'downloadFailed', code: 'NETWORK' }], available), { type: 'later' }), { type: 'update' }).kind).toBe('hidden');
  });

  it('a newer offer replaces the shown one, but never interrupts a download', () => {
    const newer = { ...offer, versionCode: 463000 };
    expect(reduce(available, { type: 'offer', offer: newer })).toMatchObject({ kind: 'available', offer: { versionCode: 463000 } });
    const dl = run([{ type: 'update' }, { type: 'permission', granted: true }], available);
    expect(reduce(dl, { type: 'offer', offer: newer })).toBe(dl);
  });

  it('stray native results in the wrong state are ignored', () => {
    expect(reduce(available, { type: 'downloaded', bytes: 1000, sha256: SHA })).toBe(available);
    expect(reduce(available, { type: 'installResult', result: 'cancelled' })).toBe(available);
    expect(reduce(available, { type: 'progress', received: 1, total: 2 })).toBe(available);
  });
});

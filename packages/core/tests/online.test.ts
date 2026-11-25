import { afterEach, describe, expect, it } from 'vitest';
import { adultFromBirthYear, asksAge, createOnline, onlineService, playGamesBridge, type PlayGamesBridge } from '../src/online/online';
import { ONLINE_STRINGS } from '../src/online/panel';
import { memoryStorage } from '../src/storage';

const TODAY = new Date(2026, 10, 20);
const boards = [
  { id: 'best', title: { en: 'Best', tr: 'En iyi' } },
  { id: 'total', title: { en: 'Total', tr: 'Toplam' } },
];

function fakeBridge(opts: { available?: boolean; autoSignIn?: boolean; signIn?: boolean } = {}) {
  const calls: string[] = [];
  const submitted: { board: string; score: number }[] = [];
  const bridge: PlayGamesBridge = {
    available: () => Promise.resolve((calls.push('available'), { value: opts.available ?? true })),
    init: () => Promise.resolve((calls.push('init'), { signedIn: opts.autoSignIn ?? false, name: 'Ada' })),
    signIn: () => Promise.resolve((calls.push('signIn'), { signedIn: opts.signIn ?? true, name: 'Ada' })),
    submitScore: (o) => Promise.resolve((calls.push('submit'), submitted.push(o), {})),
    showBoard: () => Promise.resolve((calls.push('show'), {})),
    loadMine: (o) => Promise.resolve((o.board === 'best' ? { score: 40, rank: 7 } : {})),
  };
  return { bridge, calls, submitted };
}

describe('adultFromBirthYear', () => {
  it('is conservative: only years that are 13+ whatever the birthday', () => {
    expect(adultFromBirthYear(2012, TODAY)).toBe(true); // 14 this year: at least 13
    expect(adultFromBirthYear(2013, TODAY)).toBe(false); // 13 this year: may still be 12
    expect(adultFromBirthYear(2020, TODAY)).toBe(false);
    expect(adultFromBirthYear(1980, TODAY)).toBe(true);
    expect(adultFromBirthYear(Number.NaN, TODAY)).toBe(false);
  });
});

describe('createOnline', () => {
  it('is unavailable without the native plugin', async () => {
    const o = createOnline({ bridge: null, storage: memoryStorage(), boards, scores: () => ({}) });
    await o.start();
    expect(o.state()).toBe('unavailable');
    expect(await o.signIn()).toBe(false);
  });

  it('is unavailable when the build has no Play Games config', async () => {
    const f = fakeBridge({ available: false });
    const o = createOnline({ bridge: f.bridge, storage: memoryStorage(), boards, scores: () => ({}) });
    await o.start();
    expect(o.state()).toBe('unavailable');
    expect(f.calls).not.toContain('init');
  });

  it('never initialises Play Games before the age answer (no automatic sign-in)', async () => {
    const f = fakeBridge({ autoSignIn: true });
    const o = createOnline({ bridge: f.bridge, storage: memoryStorage(), boards, scores: () => ({}) });
    await o.start();
    expect(o.state()).toBe('ask-age');
    expect(f.calls).not.toContain('init');
    expect(f.calls).not.toContain('signIn');
  });

  it('a child answer blocks everything for good and stores no birth year', async () => {
    const f = fakeBridge({ autoSignIn: true });
    const storage = memoryStorage();
    const o = createOnline({ bridge: f.bridge, storage, boards, scores: () => ({ best: 50 }), now: () => TODAY });
    expect(await o.answerAge(2016)).toBe('child');
    expect(o.state()).toBe('blocked');
    expect(await o.signIn()).toBe(false);
    await o.sync();
    expect(f.calls).not.toContain('init');
    expect(f.submitted).toEqual([]);
    // a second, older answer does not change it
    expect(await o.answerAge(1990)).toBe('child');
    expect(storage.getItem('oyun.online.age')).toBe('child');
    // a fresh start with the same storage stays blocked
    const again = createOnline({ bridge: f.bridge, storage, boards, scores: () => ({}) });
    await again.start();
    expect(again.state()).toBe('blocked');
    expect(f.calls).not.toContain('init');
  });

  it('an adult answer initialises, and a later start signs in automatically and syncs', async () => {
    const f = fakeBridge({ autoSignIn: true });
    const storage = memoryStorage();
    const o = createOnline({ bridge: f.bridge, storage, boards, scores: () => ({ best: 50, total: 0 }), now: () => TODAY });
    expect(await o.answerAge(1990)).toBe('adult');
    expect(o.state()).toBe('signed-in');
    expect(o.playerName()).toBe('Ada');
    expect(f.submitted).toEqual([{ board: 'best', score: 50 }]);

    const next = createOnline({ bridge: f.bridge, storage, boards, scores: () => ({ best: 50 }) });
    await next.start();
    expect(next.state()).toBe('signed-in');
    expect(f.submitted).toHaveLength(1); // already sent 50 from this device
  });

  it('signs in on request and sends only improved bests', async () => {
    const f = fakeBridge();
    const storage = memoryStorage({ 'oyun.online.age': 'adult' });
    let best = 10;
    const o = createOnline({ bridge: f.bridge, storage, boards, scores: () => ({ best, total: 3.7 }) });
    await o.start();
    expect(o.state()).toBe('signed-out');
    expect(await o.signIn()).toBe(true);
    expect(f.submitted).toEqual([
      { board: 'best', score: 10 },
      { board: 'total', score: 3 },
    ]);
    await o.sync();
    expect(f.submitted).toHaveLength(2);
    best = 12;
    await o.sync();
    expect(f.submitted.at(-1)).toEqual({ board: 'best', score: 12 });
  });

  it('entries merge the local best with the public entry', async () => {
    const f = fakeBridge();
    const o = createOnline({ bridge: f.bridge, storage: memoryStorage({ 'oyun.online.age': 'adult' }), boards, scores: () => ({ best: 12 }) });
    await o.start();
    await o.signIn();
    const list = await o.entries();
    expect(list.map((e) => [e.board.id, e.local, e.score, e.rank])).toEqual([
      ['best', 12, 40, 7],
      ['total', 0, undefined, undefined],
    ]);
  });

  it('a failed sign-in stays signed out and does not throw', async () => {
    const f = fakeBridge({ signIn: false });
    const o = createOnline({ bridge: f.bridge, storage: memoryStorage({ 'oyun.online.age': 'adult' }), boards, scores: () => ({}) });
    await o.start();
    expect(await o.signIn()).toBe(false);
    expect(o.state()).toBe('signed-out');
  });
});

describe('the age question is Play Games only', () => {
  it('asksAge: Play Games yes, Game Center no', () => {
    expect(asksAge('play')).toBe(true);
    expect(asksAge('gamecenter')).toBe(false);
  });

  it('defaults to Play Games (and its age question) outside a native app', async () => {
    const f = fakeBridge();
    const o = createOnline({ bridge: f.bridge, storage: memoryStorage(), boards, scores: () => ({}) });
    expect(o.service).toBe('play');
    await o.start();
    expect(o.state()).toBe('ask-age');
  });

  it('Game Center: no age question, straight to sign-in, nothing started at a first launch', async () => {
    const f = fakeBridge({ autoSignIn: true });
    const storage = memoryStorage();
    const o = createOnline({ service: 'gamecenter', bridge: f.bridge, storage, boards, scores: () => ({ best: 9 }) });
    await o.start();
    expect(o.state()).toBe('signed-out');
    expect(f.calls).not.toContain('init'); // no Apple sheet at launch
    expect(await o.signIn()).toBe(true);
    expect(o.state()).toBe('signed-in');
    expect(f.submitted).toEqual([{ board: 'best', score: 9 }]);
    expect(storage.getItem('oyun.online.age')).toBeNull();
    // later launches sign in silently, as Game Center expects
    const next = createOnline({ service: 'gamecenter', bridge: f.bridge, storage, boards, scores: () => ({ best: 9 }) });
    await next.start();
    expect(next.state()).toBe('signed-in');
  });

  it('Game Center ignores the age answer entirely (an old stored one included)', async () => {
    const f = fakeBridge();
    const storage = memoryStorage({ 'oyun.online.age': 'child' });
    const o = createOnline({ service: 'gamecenter', bridge: f.bridge, storage, boards, scores: () => ({}), now: () => TODAY });
    await o.start();
    expect(o.state()).toBe('signed-out');
    expect(await o.answerAge(2020)).toBe('adult');
    expect(storage.getItem('oyun.online.age')).toBe('child'); // untouched, unused
    expect(await o.signIn()).toBe(true);
  });

  it('Play Games after an under-13 answer: the panel says why, in both languages, and offers no retry', () => {
    expect(ONLINE_STRINGS.en.blocked).toBe('Online ranking is for players aged 13 and over.');
    expect(ONLINE_STRINGS.tr.blocked).toBe('Online sıralama 13 yaş ve üstü oyuncular içindir.');
    // the question itself never hints at the threshold
    for (const lang of ['en', 'tr'] as const) {
      for (const k of ['ageQuestion', 'agePick', 'ageWhy', 'next'] as const) expect(ONLINE_STRINGS[lang][k]).not.toMatch(/13/);
    }
  });
});

describe('native bridge selection', () => {
  const g = globalThis as { Capacitor?: unknown };
  afterEach(() => {
    delete g.Capacitor;
  });
  it('is null in a browser', () => {
    expect(onlineService()).toBeNull();
    expect(playGamesBridge()).toBeNull();
  });
  it('uses PlayGames on Android and GameCenter on iOS', () => {
    const play = { tag: 'play' };
    const gc = { tag: 'gc' };
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { PlayGames: play, GameCenter: gc } };
    expect(onlineService()).toBe('play');
    expect(playGamesBridge()).toBe(play);
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { PlayGames: play, GameCenter: gc } };
    expect(onlineService()).toBe('gamecenter');
    expect(playGamesBridge()).toBe(gc);
  });
});

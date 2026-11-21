/**
 * The interface layer and the sound of the 3D renderer: input, aim feedback, HUD, banners and
 * callouts, title, card pick (with the rewarded +1 card), result (with the rewarded revive and
 * double coins). A port of the 2D game's GameScene HUD code (buildHud,
 * syncHud, renderAim, handleEvents, onWaveStart, showBanner, callout, flyCoins) onto DOM + a 2D
 * canvas; texts, colours, sounds and icons are the game's own, imported from games/okcu.
 *
 *   ?lang=en   English (Turkish is the default)
 *   ?markers=0 hide the world markers this module draws (enemy health pills, "!" telegraph,
 *              reload ring) in case the 3D modules draw their own
 */
import { CORE_STRINGS, createAudio, createI18n, pickLanguage, webStorage } from '@oyun/core/pure';
import { DRAG_DEAD } from '@okcu/scenes/keys';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { canUpgrade, type ChestKind } from '@sim/arsenal';
import { bowTier } from '@sim/bow';
import { CHAPTERS, stageOf, STAGES } from '@sim/chapters';
import { openQueuedChest } from '@sim/chests';
import { progressScore, rankOf } from '@sim/progress';
import { boughtToday } from '@sim/shop';
import { WEAPON_IDS, WEAPON_MAX } from '@sim/weapons';
import type { GameEvent, World } from '@sim/world';
import type { Frame, Game, Module, Stage } from '../contract';
import { createChestScreen } from './chest';
import { EASE, el, injectStyle, Label, rerenderLabels, roundButton, setLabelRes, Timers } from './dom';
import { css, rgba } from './gfx';
import { createMenus } from './menus';
import { todayKey } from './save';
import { createShell, type TabId } from './shell';
import { createPainter, HUD, type PullState } from './paint';
import { createTracker } from './progress';
import { createCards, createResult, type T, type Ui } from './screens';
import { APP_STRINGS } from './strings';
import { createTitle } from './title';

const CX = 360;

export function createHud(stage: Stage, game: Game): Module {
  injectStyle();
  const params = new URLSearchParams(location.search);
  const i18n = createI18n(APP_STRINGS, pickLanguage(navigator.languages, params.get('lang')), { base: CORE_STRINGS, onMissing: (key) => console.warn(`[okcu-3d] missing string ${key}`) });
  const t: T = (key, p) => i18n.t(key as Parameters<typeof i18n.t>[0], p);
  const storage = webStorage();
  const audio = createAudio({ storage, key: 'oyun:okcu-3d:audio' });
  const unlock = (): void => audio.unlock();
  // core's createGame: the platform's pause (an ad on screen, the app hidden) silences the game
  game.platform.onLifecycle((e) => (e.type === 'pause' ? audio.suspend() : audio.resume()));
  const showMarkers = params.get('markers') !== '0';

  // ---- layers, bottom to top: shapes canvas, the logical DOM layer
  const painter = createPainter(stage);
  const layer = el('div', 'ok-layer', stage.overlay);
  const hudGroup = el('div', 'ok-group', layer);
  const floatGroup = el('div', 'ok-group', layer);
  const titleGroup = el('div', 'ok-group', layer);
  // the Home tab (title.ts) inside the tab shell's frame (shell.ts: top bar, side buttons, tab bar)
  const homePane = el('div', 'ok-group', titleGroup);
  const shellGroup = el('div', 'ok-group', layer);
  const cardGroup = el('div', 'ok-group', layer);
  const resultGroup = el('div', 'ok-group', layer);
  const menuGroup = el('div', 'ok-group', layer);
  const chestGroup = el('div', 'ok-group', layer);
  const toastGroup = el('div', 'ok-group', layer);
  const cornerGroup = el('div', 'ok-group', layer);

  /** a rewarded ad through the platform adapter; the neutral core.noAd notice when there is none */
  async function rewarded(placement: string): Promise<boolean> {
    const r = await game.rewarded(placement);
    if (r === 'unavailable') notice(t('core.noAd'));
    if (r !== 'granted') return false;
    game.platform.track('reward_claimed', { placement });
    return true;
  }
  // the safe areas (notch, home bar), read through CSS; ?safe=top,bottom fakes them in a browser
  const safeProbe = el('div', '', document.body);
  safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  const fakeSafe = (params.get('safe') ?? '').split(',').map(Number);
  /** the logical frame's rows really on screen, inside the safe areas (title layout) */
  function view(): { top: number; bottom: number } {
    const cs = getComputedStyle(safeProbe);
    const st = Math.max(parseFloat(cs.paddingTop) || 0, fakeSafe[0] || 0);
    const sb = Math.max(parseFloat(cs.paddingBottom) || 0, fakeSafe[1] || 0);
    const r = stage.root.getBoundingClientRect();
    const top = Math.max(0, st - r.top);
    const bottom = r.height - Math.max(0, sb - (window.innerHeight - r.bottom));
    return { top: (top - painter.oy) / painter.k, bottom: (bottom - painter.oy) / painter.k };
  }
  const ui: Ui = { stage, game, layer, t, audio, unlock, rewarded, view };
  const timers = new Timers();

  // ---- HUD texts (GameScene.buildHud, L.top = 0)
  const top = HUD.top;
  const waveText = new Label(hudGroup, CX, top + 78, '', { size: 38, stroke: 10 });
  const objText = new Label(hudGroup, CX, top + 124, '', { size: 28, color: PALETTE.cream, stroke: 8 });
  const bowText = new Label(hudGroup, 24, top + 46, '', { size: 24, color: PALETTE.cream, stroke: 7, originX: 0 });
  const bonusText = new Label(hudGroup, CX, top + 170, '', { size: 40, color: PALETTE.gold, stroke: 10 });
  const coinText = new Label(hudGroup, HUD.coinTextRight, top, '0', { size: 44, color: PALETTE.coin, stroke: 10, originX: 1 });
  const focusText = new Label(hudGroup, HUD.focusX, HUD.focusY - 92, '', { size: 30, color: PALETTE.focus, stroke: 8 });
  // the focus gauge is tapped to unleash when full; a tap there never starts a drag
  const focusZone = el('div', '', hudGroup);
  focusZone.dataset.ui = '1';
  focusZone.style.cssText = `position:absolute;left:${HUD.focusX - 75}px;top:${HUD.focusY - 75}px;width:150px;height:150px;border-radius:50%;pointer-events:auto;cursor:pointer;touch-action:none`;
  focusZone.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    unlock();
  });
  focusZone.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    game.unleash();
  });
  // top-right corner: pause in play (the 2D game's pauseBtn); the title has its own sound button
  const pauseBtn = roundButton(cornerGroup, HUD.cornerX, top, 96, 'pause', unlock, () => {
    audio.play('tap');
    openPause();
  });

  // ---- transient texts: banners, callouts, floats
  const banners = new Set<HTMLElement>();
  const floats = new Set<Label>();
  let bannerUntil = 0;

  function clearTransients(): void {
    for (const b of banners) b.remove();
    banners.clear();
    for (const f of floats) f.destroy();
    floats.clear();
    bannerUntil = 0;
  }

  const overlayUp = (): boolean => cards.open || result.shown || menus.open || menus.pauseOpen;

  function showBanner(text: string, sub: string | null): void {
    // never over an overlay: no banner while the cards are up or the run is over
    const phase = game.w.phase;
    if (overlayUp() || phase === 'cards' || phase === 'over') return;
    // one banner at a time: a new headline replaces whatever is still fading
    for (const b of banners) b.remove();
    banners.clear();
    const c = el('div', 'ok-anchor', floatGroup);
    c.style.left = `${CX}px`;
    c.style.top = '230px';
    banners.add(c);
    const size = text.length > 13 ? 56 : 76;
    const head = new Label(c, 0, 0, text, { size, color: PALETTE.cream, wrap: 680, stroke: size > 60 ? 18 : 14 });
    if (sub) {
      const row = el('div', '', c);
      row.style.cssText = `position:absolute;left:-330px;width:660px;top:${head.height / 2 + 14}px;display:flex;justify-content:center`;
      const pill = el('div', '', row);
      pill.style.cssText = `background:${rgba(PALETTE.ink, 0.78)};border-radius:22px;padding:14px 30px;font-size:34px;line-height:40px;text-align:center;max-width:660px`;
      pill.textContent = sub;
    }
    c.animate([{ transform: 'scale(2.2) rotate(-8deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE.backOut });
    // the banner stands in for the HUD's wave line while it is up
    bannerUntil = painter.t + (sub ? 2.9 : 1.55);
    const out = c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-60px)', opacity: 0 }], { delay: sub ? 2300 : 950, duration: 300, fill: 'forwards' });
    out.onfinish = () => {
      head.destroy();
      c.remove();
      banners.delete(c);
    };
  }

  /** A punchy callout in the upper sky. The combat ones (multi-kills, streaks, chains, focus, loot) are the fx module's; this is for the HUD's own news. */
  function callout(text: string, color: number, size: number): void {
    if (overlayUp()) return;
    const l = new Label(floatGroup, CX, 450, text, { size, color, wrap: 660, stroke: Math.round(size / 5) });
    floats.add(l);
    const tilt = -6 + Math.random() * 12;
    l.el.animate([{ transform: `scale(2.4) rotate(${tilt}deg)` }, { transform: 'none' }], { duration: 220, easing: EASE.backOut });
    const out = l.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-70px)', opacity: 0 }], { delay: 700, duration: 380, fill: 'forwards' });
    out.onfinish = () => {
      l.destroy();
      floats.delete(l);
    };
  }

  /** Rising text (tips, the tap hint). */
  function float(x: number, y: number, text: string, o: { size: number; color: number; rise?: number; duration?: number }): void {
    const l = new Label(floatGroup, x, y, text, { size: o.size, color: o.color, wrap: 660, stroke: Math.round(o.size / 5) });
    floats.add(l);
    const dur = o.duration ?? 800;
    l.el.animate([{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], { duration: 160, easing: EASE.backOut });
    const out = l.el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translateY(${-(o.rise ?? 80) * 0.7}px)`, opacity: 1, offset: 0.7 },
        { transform: `translateY(${-(o.rise ?? 80)}px)`, opacity: 0 },
      ],
      { delay: 160, duration: dur, fill: 'forwards' },
    );
    out.onfinish = () => {
      l.destroy();
      floats.delete(l);
    };
  }

  // ---- achievements and other good news: a toast at the top, one at a time (GameScene.queueToast)
  const toasts: { title: string; sub: string; color: number }[] = [];
  let toastBusy = false;
  let toastEl: { root: HTMLElement; labels: Label[] } | null = null;

  function queueToast(head: string, sub: string, color: number): void {
    toasts.push({ title: head, sub, color });
    if (!toastBusy) nextToast();
  }

  function dropToast(): void {
    if (!toastEl) return;
    for (const l of toastEl.labels) l.destroy();
    toastEl.root.remove();
    toastEl = null;
  }

  function nextToast(): void {
    dropToast();
    const n = toasts.shift();
    if (!n || game.w.phase === 'over') {
      toastBusy = false;
      return;
    }
    toastBusy = true;
    const c = el('div', 'ok-anchor', toastGroup);
    c.style.left = `${CX}px`;
    c.style.top = '62px';
    const bg = el('div', '', c);
    bg.style.cssText = `position:absolute;left:-300px;top:-48px;width:600px;height:96px;border-radius:28px;background:${rgba(PALETTE.ink, 0.92)};border:4px solid ${css(n.color)}`;
    const labels = [new Label(c, 0, -18, n.title, { size: 30, color: n.color }), new Label(c, 0, 20, n.sub, { size: 28, color: PALETTE.cream, wrap: 560 })];
    toastEl = { root: c, labels };
    audio.playPreset(SFX.fanfare, { volume: 0.6 });
    c.animate([{ transform: 'translateY(-142px)' }, { transform: 'none' }], { duration: 320, easing: EASE.backOut });
    const out = c.animate([{ transform: 'none' }, { transform: 'translateY(-142px)' }], { delay: 1900, duration: 260, easing: EASE.cubicIn, fill: 'forwards' });
    out.onfinish = () => {
      if (toastEl?.root === c) nextToast();
    };
  }

  /** A neutral one-line notice near the bottom (core toast, position 'bottom'), e.g. "no ad right now". */
  let noticeEl: { root: HTMLElement; label: Label } | null = null;
  function notice(text: string): void {
    if (noticeEl) {
      noticeEl.label.destroy();
      noticeEl.root.remove();
    }
    const c = el('div', 'ok-anchor', toastGroup);
    c.style.left = `${CX}px`;
    c.style.top = '1236px';
    c.dataset.testid = 'notice';
    const bg = el('div', '', c);
    bg.style.cssText = `position:absolute;left:-320px;top:-36px;width:640px;height:72px;border-radius:36px;background:${rgba(PALETTE.ink, 0.9)}`;
    const label = new Label(c, 0, 0, text, { size: 28, color: PALETTE.cream, wrap: 600 });
    if (label.width > 600) label.setScale(600 / label.width);
    const mine = { root: c, label };
    noticeEl = mine;
    c.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: EASE.backOut });
    const out = c.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 2200, duration: 300, fill: 'forwards' });
    out.onfinish = () => {
      if (noticeEl !== mine) return;
      label.destroy();
      c.remove();
      noticeEl = null;
    };
  }

  function clearToasts(): void {
    toasts.length = 0;
    toastBusy = false;
    dropToast();
  }

  // ---- what the run writes to the save
  const tracker = createTracker(game, (id, coins) => queueToast(t('feat.title'), `${t(`feat.${id}.name`)} · +${coins}`, PALETTE.gold));

  // ---- screens
  /** the next shell comes back without its entrance (our own chapter switch rebuilds the menu) */
  let shellQuiet = false;
  /** the tab the next shell comes back on (Home, or where a full-screen tab or a new world left off) */
  let shellTab: TabId = 'home';
  /** our own rebuild keeps the good news already queued (an achievement earned in a pane) */
  let keepToasts = false;
  /** a new world for the title, the shell back on `tab` without its entrance (the menu stays where it was) */
  const titleOn = (tab: TabId, keep = false): void => {
    shellTab = tab;
    shellQuiet = true;
    keepToasts = keep;
    game.startRun({ daily: game.daily });
  };
  const title = createTitle(ui, homePane, {
    // chapter select: step through the chapters reached (and endless once unlocked), wrapping round
    chapter: (dir) => {
      const last = game.save.data.chapter;
      const c = game.chapter + dir;
      shellQuiet = true;
      game.startRun({ chapter: c > last ? 0 : c < 0 ? last : c });
    },
  });
  // the main menu's tabs: Ranks still opens the full screen of menus.ts
  const shell = createShell(ui, shellGroup, {
    home: homePane,
    ranks: () => menus.openRanks('title'),
    // the Weapons pane changed the save: the run's levels are fixed when its world is made
    rebuild: (tab) => titleOn(tab, true),
    // the Events tab's daily switch: a new world, the menu back on Home without the entrances
    daily: () => {
      shellQuiet = true;
      keepToasts = true;
      title.quiet();
      game.startRun({ daily: !game.daily });
    },
    toast: (head, sub) => queueToast(head, sub, PALETTE.gold),
    changed: () => syncBadges(),
    chest: (p) => chests.play(p),
    chestBusy: () => chests.shown,
  });
  // the chest opening (chest.ts): over the menu and the result card, under the toasts
  const chests = createChestScreen(ui, chestGroup, { toast: (head, sub) => queueToast(head, sub, PALETTE.gold) });
  /** the run chest the result card offers: still where `grantRunChest` put it, unopened */
  const runChestWaiting = (): ChestKind | null => {
    const a = game.save.data.arsenal;
    return a.runChest >= 0 ? (a.chests[a.runChest] ?? null) : null;
  };
  /** the migration's welcome gold chest, presented once when the menu first comes up */
  function welcome(): void {
    if (!game.save.data.arsenal.welcome || chests.shown || game.testRun || !shell.shown) return;
    chests.play({
      take: (d) => {
        d.arsenal.welcome = false;
        const i = d.arsenal.chests.indexOf('gold');
        return i >= 0 ? openQueuedChest(d, i) : null;
      },
      title: t('chest.welcome'),
      sub: t('chest.welcomeSub'),
      done: (before) => shell.opened(before),
    });
  }

  /** the tab bar's red badges, from the save */
  function syncBadges(): void {
    const d = game.save.data;
    // today's offers still to buy that the coins cover (a new day's offers count once they are drawn)
    const key = todayKey();
    const got = boughtToday(d, key);
    const offers = d.arsenal.shopDay === key ? d.arsenal.shopOffers : [];
    shell.badge('shop', offers.filter((o, i) => !got.includes(i) && d.coins >= o.coins && d.arsenal.weapons[o.weapon].level < WEAPON_MAX).length);
    // a weapon ready to level up (the archer card marks its own affordable upgrades)
    shell.badge('weapons', WEAPON_IDS.some((id) => canUpgrade(d, id)) ? '!' : 0);
    shell.badge('ranks', rankOf(progressScore(d).total) > d.rank ? '!' : 0);
    shell.badge('events', !game.daily && d.dailyDone !== todayKey() ? '!' : 0);
  }
  const cards = createCards(ui, cardGroup, clearTransients, (syn) => callout(t('cards.synergy', { s: t(`syn.${syn}`) }), PALETTE.focus, 56));
  const result = createResult(ui, resultGroup, {
    replay: () => game.startRun({ daily: game.daily, quick: true }),
    // ResultScene.revive → GameScene with revive: the same world, from the same wave, half health;
    // coins and best were banked as the run went, the revived run banks only what it adds
    revive: () => {
      const w = game.w;
      if (!game.revive()) return;
      menus.closeAll();
      result.hide();
      resultPending = false;
      tracker.revive();
      showBanner(waveLabel(w), null);
    },
    // ResultScene.double: the run's coins once more (never in a test run, which leaves the save alone)
    double: (amount) => {
      if (amount <= 0 || game.testRun || !game.w.bank) return 0;
      game.save.update((d) => {
        d.coins += amount;
      });
      doubledCoins += amount;
      return amount;
    },
    upgrades: () => titleOn('weapons'),
    shop: () => titleOn('shop'),
    runChest: runChestWaiting,
    openRunChest: () => {
      if (!runChestWaiting()) return false;
      return chests.play({ take: (d) => (d.arsenal.runChest >= 0 ? openQueuedChest(d, d.arsenal.runChest) : null) });
    },
    home: () => game.toTitle(),
    ranks: () => {
      if (!menus.ceremonyOpen) menus.openRanks('result');
    },
  });
  const menus = createMenus(ui, menuGroup, {
    resume: () => {
      menus.closePause();
      game.setPaused(false);
    },
    quit: () => {
      tracker.bank(game.w);
      game.toTitle();
    },
    restart: () => {
      tracker.bank(game.w);
      game.startRun({ daily: game.daily, quick: true });
    },
    // 2D: back from the shop or ranks is a fresh title, so a change shows on the next run at once;
    // opened from a tab, the shell comes back on the tab that was up before it
    back: () => {
      const tab = shell.shown ? shell.returnTab : 'home';
      const quiet = shell.shown;
      menus.closeAll();
      shellTab = tab;
      shellQuiet = quiet;
      game.toTitle();
    },
  });

  function openPause(): void {
    if (menus.pauseOpen) return;
    const phase = game.w.phase;
    if (phase === 'title' || phase === 'over') return;
    clearTransients();
    tracker.bank(game.w);
    cancelDrag();
    game.setPaused(true);
    menus.openPause();
  }
  // the app may be killed while hidden: bank first (main.ts pauses the run)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) tracker.bank(game.w);
  });

  // ---- per-run state (the world object is replaced on restart)
  let world: World | null = null;
  let coinShown = 0;
  let coinsInFlight = 0;
  let hudAlpha = 0;
  let treasurePick = false;
  let resultPending = false;
  /** coins of this run already doubled by an ad (a revived run doubles only what it added since) */
  let doubledCoins = 0;
  let lastTeach = -9;
  let lastCreak = 0;
  const seen = new Set<string>();
  const brains = new Map<number, string>();

  function resetRun(w: World): void {
    world = w;
    timers.clear();
    clearTransients();
    if (!keepToasts) clearToasts();
    keepToasts = false;
    tracker.reset(w);
    menus.closeAll();
    cancelDrag();
    painter.clearCoins();
    cards.close();
    result.hide();
    title.clear();
    // a new world: the shell comes back on Home (quietly after our own chapter switch)
    shell.hide(true);
    seen.clear();
    brains.clear();
    for (const e of w.enemies) seen.add(e.type);
    coinShown = w.run.coins;
    coinsInFlight = 0;
    treasurePick = false;
    resultPending = false;
    doubledCoins = 0;
    painter.snapHp(w);
    hudAlpha = w.phase === 'title' ? 0 : 1;
    if (w.phase === 'title') title.show(w);
    else showBanner(waveLabel(w), null); // a run that begins mid-way (?wave=N) announces where it is
  }

  /** delayed work that must not outlive the run it was scheduled in */
  function later(seconds: number, fn: (w: World) => void): void {
    const w = game.w;
    timers.after(seconds, () => {
      if (game.w === w) fn(w);
    });
  }

  const chapterName = (c: number): string => t(`chapter.${Math.min(CHAPTERS, c)}`);
  const objectiveText = (kind: string, limit: number): string => t(`obj.${kind}`, { n: limit });

  function waveLabel(w: World): string {
    const p = stageOf(w.wave);
    if (p.endless) return t('hud.endlessWave', { n: w.wave - CHAPTERS * STAGES });
    return `${t('hud.chapterNo', { n: p.chapter + 1 })} · ${t('hud.stage', { s: p.stage })}`;
  }

  /** a world point (logical px) in the HUD's logical px, wherever the stage's camera puts it */
  function hudPoint(x: number, y: number): { x: number; y: number } {
    const s = stage.toScreen(x, y);
    return { x: (s.x - painter.ox) / painter.k, y: (s.y - painter.oy) / painter.k };
  }

  function flyCoins(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    const n = Math.min(12, Math.max(3, Math.round(amount / 2)));
    let left = amount;
    let i = 0;
    coinsInFlight += n;
    painter.flyCoins(x, y, n, () => {
      i += 1;
      coinsInFlight -= 1;
      const add = i === n ? left : Math.floor(amount / n);
      left -= add;
      coinShown += add;
      painter.coinPop();
      audio.playPreset(SFX.tick, { pitch: Math.min(12, i), jitter: 0 });
    });
  }

  /** A one-time tip the first time something new shows up in this run. */
  function teach(key: string, text: string): void {
    if (seen.has(`tip-${key}`)) return;
    seen.add(`tip-${key}`);
    float(CX, 420, text, { size: 34, color: PALETTE.cream, rise: 30, duration: 2600 });
  }

  const hasIntro = (type: string): boolean =>
    type === 'shield' || type === 'jumper' || type === 'bomber' || type === 'healer' || type === 'cover' || type === 'catcher' || type === 'ward' || type === 'elite' || type === 'volley' || type === 'mage';

  function onWaveStart(w: World, e: Extract<GameEvent, { t: 'waveStart' }>): void {
    const wave = e.wave;
    const types = new Set(w.enemies.map((x) => x.type));
    let intro: string | null = null;
    for (const type of types) {
      if (type === 'imp' || type === 'boss') continue;
      if (!seen.has(type) || (wave > 1 && type !== 'archer' && !seen.has(`intro-${type}`) && hasIntro(type))) {
        if (hasIntro(type)) intro = t(`hud.new.${type}`);
        seen.add(`intro-${type}`);
      }
      seen.add(type);
    }
    // field tips, once a run each: wind, ropes, barrels, rocks
    const tip = (key: string, on: boolean, text: string): void => {
      if (intro || !on || seen.has(`tip-${key}`)) return;
      intro = t(text);
      seen.add(`tip-${key}`);
    };
    tip('wind', w.wind !== 0, 'hud.windTip');
    tip('rope', w.movers.some((m) => m.kind === 'swing'), 'hud.ropeTip');
    tip('barrel', w.props.some((p) => p.active && p.kind === 'barrel'), 'hud.barrelTip');
    tip('rock', w.props.some((p) => p.active && p.kind === 'rock'), 'hud.rockTip');
    tip('bob', w.movers.some((m) => m.kind === 'bob'), 'hud.bobTip');
    tip('gust', w.gustEvery > 0, 'hud.gustTip');
    const obj = e.objective ? objectiveText(e.objective, e.limit) : null;
    // a grown field (chapter 4, and again chapter 6): said once a run, after the banner
    if (w.span > 1) {
      const key = `grow-${w.span}`;
      later(1.7, () => teach(key, t('hud.fieldGrows')));
    }
    if (e.boss) {
      showBanner(t(`boss.${e.boss}`), t(`boss.tip.${e.boss}`));
    } else if (e.stage === 1 && wave > 1 && !stageOf(wave).endless) {
      // a new chapter: its name over the cross-fade into the new world
      audio.play('win', { volume: 0.5 });
      showBanner(chapterName(e.chapter), t('hud.chapterNo', { n: e.chapter + 1 }));
    } else {
      audio.playPreset(SFX.drum);
      if (wave > 1 || w.startChapter > 0) showBanner(e.elite ? t('hud.elite') : waveLabel(w), intro ?? obj);
    }
    // landing thumps for archers dropping in (the first wave's archers were already standing at the title)
    if (wave > 1) later(0.56, (now) => {
      if (now.enemies.length) audio.playPreset(SFX.slam, { volume: 0.6 });
    });
  }

  /**
   * GameScene.handleEvents: every sound, and the HUD's share of the feedback (coins, banners, tips, the
   * objective line). World effects, damage numbers and words, combat call-outs, the flash and the
   * vignettes are the fx module's.
   */
  let eruptAt = -9;
  function handleEvents(w: World, events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'shot':
          audio.playPreset(SFX.snap, { pitch: e.power * 3 });
          audio.playPreset(SFX.whistle, { volume: 0.6 + e.power * 0.4, pitch: e.power * 2 });
          break;
        case 'hit':
          audio.playPreset(SFX.thunk, { pitch: e.part === 'head' ? 3 : 0 });
          if (e.crit) audio.playPreset(SFX.crit);
          if (e.slowmo) audio.playPreset(SFX.ping);
          break;
        case 'bodyThunk':
          audio.playPreset(SFX.thunk, { volume: 0.6, pitch: -2 });
          break;
        case 'playerHit':
          audio.playPreset(SFX.ouch);
          audio.playPreset(SFX.thunk, { volume: 0.7, pitch: -3 });
          painter.hpPop(1);
          break;
        case 'blocked':
          audio.playPreset(SFX.bubble);
          break;
        case 'ko': {
          audio.playPreset(SFX.boing, { pitch: e.enemy === 'boss' ? -5 : 0 });
          const s = hudPoint(e.x, e.y);
          flyCoins(s.x, s.y, e.coins);
          break;
        }
        case 'loot': {
          const s = hudPoint(e.x, e.y);
          audio.playPreset(SFX.loot);
          if (e.kind === 'boss') audio.play('win');
          flyCoins(s.x, s.y, e.coins);
          break;
        }
        case 'poof':
          audio.playPreset(SFX.poof);
          brains.delete(e.id);
          break;
        case 'thunk':
          audio.playPreset(SFX.thock, { volume: e.owner === 'player' ? 1 : 0.5 });
          break;
        case 'bounce':
          audio.playPreset(SFX.thock, { pitch: 7 });
          break;
        case 'shieldHit':
          audio.playPreset(SFX.clang, { pitch: e.broke ? -4 : 0 });
          break;
        case 'plate':
          audio.playPreset(SFX.clang, { pitch: 4 });
          break;
        case 'bomb':
          audio.playPreset(SFX.boom, { volume: e.popped ? 0.7 : 1 });
          break;
        case 'barrel':
          audio.playPreset(SFX.boom);
          break;
        case 'blast':
          audio.playPreset(SFX.boom, { volume: 0.6, pitch: 4 });
          break;
        case 'orbPop':
          audio.playPreset(SFX.plink);
          break;
        case 'apple':
          audio.playPreset(SFX.crunch);
          break;
        case 'heal':
          painter.hpPop(0.7);
          break;
        case 'healBeam':
          audio.playPreset(SFX.heal);
          break;
        case 'zap':
          audio.playPreset(SFX.zap);
          break;
        case 'caught':
          audio.playPreset(SFX.caught);
          teach('catcher-caught', t('hud.new.catcher'));
          break;
        case 'ward':
          audio.playPreset(SFX.ward, { pitch: e.up ? 5 : 0 });
          break;
        case 'bossPhase':
          audio.playPreset(SFX.roar);
          showBanner(t('hud.phase2'), null);
          break;
        case 'summon':
          audio.playPreset(SFX.summon);
          break;
        case 'blink':
          audio.playPreset(SFX.summon, { pitch: 9, volume: 0.7 });
          break;
        case 'chill':
          audio.playPreset(SFX.plink, { pitch: 8, volume: 0.6 });
          break;
        case 'rope':
          audio.playPreset(SFX.snapRope);
          break;
        case 'rockHit':
          audio.playPreset(SFX.crumble);
          break;
        case 'rockBreak':
          audio.playPreset(SFX.crumble, { volume: 0.8 });
          break;
        case 'multi':
          audio.playPreset(SFX.stinger, { pitch: e.n * 2 });
          break;
        case 'streak':
          audio.playPreset(SFX.stinger, { pitch: Math.min(12, e.n / 2) });
          break;
        case 'chain': {
          // an escalating payoff: higher pitch and a golden coin pop (the text is the fx module's)
          audio.playPreset(SFX.ping, { pitch: Math.min(12, e.n * 2) });
          const s = hudPoint(e.x, e.y);
          flyCoins(s.x, s.y, e.coins);
          break;
        }
        case 'focusReady':
          audio.playPreset(SFX.ready);
          break;
        case 'focus':
          if (e.on) audio.playPreset(SFX.focus);
          break;
        case 'enemyDraw':
          audio.playPreset(SFX.enemyDraw, { volume: 0.8 });
          break;
        case 'enemyShot':
          audio.playPreset(SFX.enemySnap);
          if (e.kind === 'bomb') audio.playPreset(SFX.fuse);
          if (e.kind === 'orb') audio.playPreset(SFX.summon, { pitch: 6, volume: 0.6 });
          break;
        case 'waveStart':
          onWaveStart(w, e);
          break;
        case 'eruption':
          // one roar per volley (each rock is its own event)
          if (painter.t - eruptAt > 0.4) {
            eruptAt = painter.t;
            audio.playPreset(SFX.roar, { volume: 0.35 });
            audio.playPreset(SFX.fuse, { volume: 0.5 });
          }
          break;
        case 'gust':
          audio.playPreset(SFX.charge, { volume: 0.45, pitch: e.wind > 0 ? 2 : -2 });
          break;
        case 'waveClear':
          // bank at every wave clear: nothing earned is lost if the app dies at the card pick
          tracker.bank(w, e.wave + 1);
          // let the knockout land first
          later(0.9, (now) => {
            if (overlayUp() || now.phase !== 'clear') return;
            audio.play('win', { volume: 0.7 });
            showBanner(t('hud.clear'), null);
            flyCoins(CX, 520, e.coins);
          });
          break;
        case 'objective': {
          const msg = e.ok ? t('obj.done', { n: e.coins }) : t('obj.fail');
          later(e.ok ? 1.3 : 1.2, () => {
            if (overlayUp()) return;
            if (e.ok) {
              audio.playPreset(SFX.loot);
              callout(msg, PALETTE.heal, 50);
              flyCoins(CX, 600, e.coins);
            } else callout(msg, PALETTE.locked, 40);
          });
          break;
        }
        case 'bonusStart':
          clearTransients();
          audio.play('win', { volume: 0.6 });
          showBanner(t(`bonus.${e.kind}`), t(`bonus.tip.${e.kind}`));
          break;
        case 'bonusHit': {
          const s = hudPoint(e.x, e.y);
          audio.playPreset(e.bull ? SFX.ping : SFX.tick, { pitch: e.bull ? 4 : 6 });
          flyCoins(s.x, s.y, e.coins);
          break;
        }
        case 'bonusEnd':
          if (e.grade !== 'none') audio.playPreset(SFX.fanfare);
          showBanner(t(`bonus.${e.grade}`), t('bonus.hits', { n: e.hits, c: e.coins }));
          if (e.grade !== 'none') flyCoins(CX, 560, Math.max(3, Math.round(e.coins / 3)));
          break;
        case 'cards':
          treasurePick = e.treasure;
          break;
        case 'dying':
          audio.play('lose');
          break;
        default:
          break;
      }
    }
  }

  // ---- input: drag anywhere on the stage; buttons win
  let dragId = -1;
  let pull: PullState | null = null;
  let lx0 = 0;
  let ly0 = 0;
  let lx = 0;
  let ly = 0;
  const root = stage.root;

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function cancelDrag(): void {
    if (dragId === -1) return;
    dragId = -1;
    pull = null;
    game.dragCancel();
  }

  root.addEventListener('pointerdown', (e) => {
    unlock();
    if (dragId !== -1) return;
    if (e.target instanceof Element && e.target.closest('[data-ui]')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (game.paused || menus.open || menus.pauseOpen) return;
    const phase = game.w.phase;
    if (phase === 'cards' || phase === 'dying' || phase === 'over') return;
    dragId = e.pointerId;
    const c = local(e);
    pull = { x0: c.x, y0: c.y, x: c.x, y: c.y };
    const p = stage.toLogical(e.clientX, e.clientY);
    lx0 = lx = p.x;
    ly0 = ly = p.y;
    lastCreak = 0;
    game.dragStart(p.x, p.y);
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers cannot be captured */
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId || !pull) return;
    const c = local(e);
    pull.x = c.x;
    pull.y = c.y;
    const p = stage.toLogical(e.clientX, e.clientY);
    lx = p.x;
    ly = p.y;
    game.dragMove(p.x, p.y);
  });
  root.addEventListener('pointerup', (e) => {
    if (e.pointerId !== dragId) return;
    const p = stage.toLogical(e.clientX, e.clientY);
    lx = p.x;
    ly = p.y;
    game.dragMove(p.x, p.y);
    const tap = Math.hypot(lx0 - lx, ly0 - ly) < DRAG_DEAD;
    const at = pull;
    dragId = -1;
    pull = null;
    game.dragEnd();
    if (!tap) return;
    // a tap or a tiny drag: no dud arrow, but show what to do instead
    audio.playPreset(SFX.cancel);
    const phase = game.w.phase;
    if ((phase === 'title' || phase === 'play') && at && painter.t - lastTeach >= 0.9) {
      lastTeach = painter.t;
      title.nudge();
      float((at.x - painter.ox) / painter.k, (at.y - painter.oy) / painter.k - 70, t('title.tapHint'), { size: 40, color: PALETTE.cream, rise: 60, duration: 900 });
    }
  });
  root.addEventListener('pointercancel', (e) => {
    if (e.pointerId === dragId) cancelDrag();
  });
  root.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === dragId) cancelDrag();
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', cancelDrag);
  // labels measured before the web font arrived are redrawn (and the title re-laid out) once it is in
  const onFont = (): void => {
    rerenderLabels();
    if (title.shown && world && world.phase === 'title') title.relayout();
    if (shell.shown) shell.relayout();
  };
  void document.fonts?.load(`800 40px "Nunito"`, 'AĞİŞÇÖÜ ağışçöü').then(onFont, () => undefined);

  // ---- frame
  function syncHud(w: World, real: number): void {
    const showWave = w.phase !== 'title' && w.phase !== 'cards' && w.phase !== 'bonus';
    const bannerUp = painter.t < bannerUntil;
    waveText.setText(showWave ? waveLabel(w) : '').setVisible(!bannerUp);
    objText.setText(w.objective && showWave ? objectiveText(w.objective.kind, w.objective.limit) : '').setVisible(!bannerUp);
    const level = game.bowLevel;
    // the run's weapon and its level (hard, the 3D build); the classic setting still shows the forged bow
    if (w.difficulty === 'hard') bowText.setText(`${t(`weapon.${w.meta.weapon}`)} · ${t('weapons.lv', { n: w.meta.wlevel })}`);
    else bowText.setText(level > 0 ? t('bow.name', { name: t(`bow.${bowTier(level)}`), n: level }) : '');
    const b = w.bonus;
    bonusText.setText(b && b.t >= 0 && b.grade === null ? t('bonus.hits', { n: b.hits, c: b.coins }) : '');
    // coins count up as the flying coins land; with none in the air the counter is simply the truth
    if (coinsInFlight <= 0 && coinShown !== w.run.coins) {
      const d = w.run.coins - coinShown;
      coinShown += Math.abs(d) <= 1 ? d : Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * Math.min(1, real * 10)));
      if (d > 0) painter.coinPop();
    }
    coinText.setText(String(coinShown)).setScale(1 + painter.coinPopValue * 0.35);
    // the focus gauge's caption
    const live = w.phase !== 'title' && w.phase !== 'cards' && w.player.alive;
    const ready = live && painter.focusReady;
    focusZone.style.display = live ? '' : 'none';
    focusText.setText(!live ? '' : ready ? t('hud.focusTap') : w.focusT > 0 ? t('hud.focus') : '').setScale(ready ? 1 + Math.sin(painter.t * 8) * 0.08 : 1);
    const op = hudAlpha.toFixed(2);
    if (hudGroup.style.opacity !== op) hudGroup.style.opacity = op;
  }

  return {
    update(frame: Frame) {
      const w = frame.w;
      const real = frame.real;
      if (painter.resize()) {
        layer.style.transform = `translate(${painter.ox}px, ${painter.oy}px) scale(${painter.k})`;
        setLabelRes(Math.min(3, window.devicePixelRatio || 1) * painter.k);
        // the menu follows the screen's real edges
        if (title.shown && w === world) title.relayout();
        if (shell.shown && w === world) shell.relayout();
      }
      if (w !== world) resetRun(w);
      menus.update(real);
      // a pause from elsewhere (the page was hidden) opens the menu; a resume closes it
      if (game.paused && !menus.pauseOpen) openPause();
      if (!game.paused && menus.pauseOpen) menus.closePause();
      if (!game.paused) timers.update(real);
      tracker.frame(w);
      handleEvents(w, frame.events);

      // the boss's entry beat: a roar as it lands
      for (const a of w.enemies) {
        const was = brains.get(a.id);
        if (a.type === 'boss' && was === 'spawn' && a.brain !== 'spawn' && a.brain !== 'jump') audio.playPreset(SFX.roar);
        brains.set(a.id, a.brain);
      }
      // string creak: a tick every 8 % of extra pull
      const shot = frame.aim?.shot;
      if (shot && dragId !== -1 && Math.abs(shot.power - lastCreak) > 0.08) {
        audio.playPreset(SFX.creak, { pitch: shot.power * 9, volume: 0.9 });
        lastCreak = shot.power;
      }

      // title → play: the first shot starts the run
      if (w.phase === 'title') {
        if (!title.shown && !result.shown) title.show(w);
      } else if (title.shown) title.hide();
      // the tab shell frames the title's menu state; away in the ready state, in play and under the result
      const wantShell = w.phase === 'title' && title.shown && !title.ready && !result.shown;
      if (wantShell && !shell.shown) {
        shell.show(shellTab, { quiet: shellQuiet });
        shellQuiet = false;
        shellTab = 'home';
        syncBadges();
        if (game.save.data.arsenal.welcome) later(0.7, () => welcome());
      } else if (!wantShell && shell.shown) shell.hide();
      // a menu screen replaces the title (the 2D game switches scenes)
      const vis = menus.open ? 'hidden' : '';
      if (titleGroup.style.visibility !== vis) titleGroup.style.visibility = vis;
      if (shellGroup.style.visibility !== vis) shellGroup.style.visibility = vis;
      // the corner: pause in play, nothing on the title, over the result or a menu
      const phase = w.phase;
      pauseBtn.el.style.display = phase !== 'title' && phase !== 'over' && !menus.pauseOpen && !menus.open ? '' : 'none';
      // the HUD fades in with the first shot and out under the result card
      hudAlpha = w.phase === 'title' ? 0 : result.shown ? Math.max(0, hudAlpha - real / 0.2) : Math.min(1, hudAlpha + real / 0.3);

      painter.begin(real);
      if (showMarkers) painter.markers(w, w.time);
      painter.aim(w, frame.aim, pull);
      // the coin sits left of the counter, clear of it even while the number pops
      const coinX = HUD.coinTextRight - coinText.width * (1 + painter.coinPopValue * 0.35) - 30;
      if (hudAlpha > 0) painter.hud(w, coinX, hudAlpha);
      if (w.phase === 'title' && !pull && !menus.open && title.ready) painter.thumbHint();
      painter.coins(real, coinX);
      syncHud(w, real);

      cards.sync(w, treasurePick);
      // dead → the result card, a beat after the fall
      if (w.phase === 'over' && !result.shown && !resultPending) {
        resultPending = true;
        clearTransients();
        clearToasts();
        // GameScene.finish: bank everything (and the daily), then the result a beat later
        const run = tracker.finish(w);
        later(0.35, () => {
          // the rewarded offers: revive once per run; double the coins not doubled yet (a real run only)
          const ads = { revive: game.canRevive, double: game.testRun || !w.bank ? 0 : Math.max(0, run.coins - doubledCoins) };
          result.show(run, ads);
          // ResultScene: a higher rank than the one last celebrated plays the ceremony
          const rank = rankOf(progressScore(game.save.data).total);
          if (rank > game.save.data.rank) {
            game.save.update((d) => {
              d.rank = rank;
            });
            later(0.5, () => {
              if (result.shown) menus.rankUp(rank);
            });
          }
        });
      }
      result.update(real);
    },
  };
}

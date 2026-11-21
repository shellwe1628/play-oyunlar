/**
 * The tabbed main menu's frame around the Home tab (title.ts), over the live 3D scene:
 *
 * - top bar:      the rank chip with the player's POWER (`powerOf`), the coins, the sound button
 * - side buttons: the free chest (a countdown; it glows and claims a wooden chest when ready) and
 *                 the daily (a red "!" while today's daily is not done; opens the Events tab)
 * - tab bar:      Shop · Weapons · Home (centre, larger) · Ranks · Events, with red badges
 *
 * Home is title.ts's layer (`ShellHooks.home`), Weapons is weapons.ts's pane (the archer card, the
 * weapon grid and the detail card), Events is the shell's own pane (the daily card and its toggle);
 * they slide sideways on a switch. Shop and Ranks still open the full screens of menus.ts (the
 * looks, the ranks); closing one comes back to the tab that was up before it (`returnTab`).
 * A change made in the Weapons pane (an upgrade, a selection) needs a new world before the next run
 * (its levels are fixed when the world is made): leaving the tab asks for one (`ShellHooks.rebuild`).
 * Tabs switch with a tap or a horizontal swipe on the tab bar (and on the Weapons and Events panes); a drag on
 * the open sky of the Home tab still draws the bow, as before.
 *
 * Everything lives in the HUD's logical 720 × 1280 layer and follows the real screen edges and
 * safe areas (`Ui.view`). Reduced motion (`calmMotion`): no pulses or glows, tabs cut instead of slide.
 */
import { drawBadge } from '@okcu/scenes/gear';
import { drawCoin } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { powerOf } from '@sim/arsenal';
import { claimFreeChest, freeChestWait } from '@sim/chests';
import type { ChestKind } from '@sim/arsenal';
import type { SaveData } from '@sim/meta';
import { dailyChallenge, liveStreak, progressScore, RANKS, rankOf } from '@sim/progress';
import { button, calmMotion, EASE, el, fitText, iconCanvas, Label, mix, pressable, roundButton, TAB_BAR_H } from './dom';
import { css, Gfx, rgba } from './gfx';
import { todayKey } from './save';
import type { Ui } from './screens';
import { drawCalendarGlyph } from './title';
import { createWeaponsPane, drawWeaponIcon, type WeaponsPane } from './weapons';

export type TabId = 'shop' | 'weapons' | 'home' | 'ranks' | 'events';
export const TAB_IDS: readonly TabId[] = ['shop', 'weapons', 'home', 'ranks', 'events'];

export interface ShellHooks {
  /** the Home tab's layer (title.ts draws into it); the shell slides it with the tabs */
  home: HTMLElement;
  /** the tabs that still open a full screen of menus.ts */
  shop: () => void;
  ranks: () => void;
  /** the Weapons pane changed the save: a new world (its levels), then the shell back on `tab` */
  rebuild: (tab: TabId) => void;
  /** the daily run on / off (the Events tab's button) */
  daily: () => void;
  /** a small piece of good news at the top (the HUD's toast) */
  toast: (head: string, sub: string) => void;
  /** the shell changed the save (a free chest claimed, a weapon levelled): the badges again */
  changed: () => void;
}

export interface Shell {
  readonly shown: boolean;
  readonly tab: TabId;
  /** build (if needed) and go to `tab`; `quiet` skips the entrance (a chapter switch) */
  show(tab: TabId, opts?: { quiet?: boolean }): void;
  /** a red badge on a tab: a count, '!' or 0 (none) */
  badge(tab: TabId, n: number | '!'): void;
  /** away during play (and the ready state); `instant` drops it without the fade */
  hide(instant?: boolean): void;
  /** the same shell laid out again (resize, fonts), on the same tab, without the entrance */
  relayout(): void;
  /** the tab that was up before a full-screen tab (Shop, Ranks) opened: where closing it returns */
  readonly returnTab: TabId;
}

const CX = 360;
const INK = PALETTE.ink;
const W = 720;
/** tab widths: four side tabs and the larger centre (Home) */
const SIDE_W = 130;
const HOME_W = W - 4 * SIDE_W;
const TAB_TINT: Record<TabId, number> = { shop: 0x4cc96a, weapons: 0xff8a4c, home: PALETTE.gold, ranks: 0x58a6ff, events: 0xff6f9a };
const TAB_KEY: Record<TabId, string> = { shop: 'tab.shop', weapons: 'tab.weapons', home: 'tab.home', ranks: 'tab.ranks', events: 'tab.events' };

const WOOD = `repeating-linear-gradient(180deg,rgba(0,0,0,0) 0 38px,rgba(66,30,10,.4) 38px 42px),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 3px,rgba(0,0,0,.04) 3px 11px),linear-gradient(180deg,#d08a48,#a9632e)`;

const STYLE = `
.ok-s-part{position:absolute;width:0;height:0}
.ok-s-glass{background:${rgba(INK, 0.74)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.16),0 6px 0 ${rgba(INK, 0.35)}}
.ok-s-bar{position:absolute;left:0;top:0;width:${W}px;height:120px;display:flex;align-items:center;gap:12px;padding:0 124px 0 16px}
.ok-s-chip{position:relative;height:92px;border-radius:46px;display:flex;align-items:center;gap:8px;padding:0 24px 0 8px;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .1s ease-out;min-width:0}
.ok-s-chip.down{transform:scale(1.06,.88)}
.ok-s-chip .t1{font-size:28px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-s-pow{display:flex;align-items:center;gap:6px;margin-top:5px;white-space:nowrap}
.ok-s-pow b{font-size:20px;line-height:1;color:${css(PALETTE.cream)};opacity:.8;letter-spacing:1px}
.ok-s-pow span{font-size:30px;line-height:1;color:#fff}
.ok-s-coins{height:68px;border-radius:34px;display:flex;align-items:center;gap:8px;padding:0 22px 0 9px;font-size:36px;color:${css(PALETTE.coin)};margin-left:auto;white-space:nowrap}
.ok-s-round{background:${rgba(INK, 0.74)}!important;box-shadow:inset 0 0 0 3px rgba(255,255,255,.16),0 6px 0 ${rgba(INK, 0.35)}!important}
.ok-s-side{position:absolute;left:-64px;top:-60px;width:128px;height:156px;pointer-events:auto;cursor:pointer;touch-action:none}
.ok-s-plank{position:absolute;left:8px;top:0;width:112px;height:112px;border-radius:28px;border:6px solid ${css(INK)};background:${WOOD};box-shadow:0 8px 0 ${rgba(INK, 0.45)},inset 0 4px 0 rgba(255,236,190,.35),inset 0 -6px 0 rgba(60,25,8,.35);transition:transform .1s ease-out}
.ok-s-plank>canvas{position:absolute;left:-6px;top:-6px}
.ok-s-side.down .ok-s-plank{transform:scale(1.1,.84)}
.ok-s-side>.lbl{position:absolute;left:-16px;right:-16px;top:118px;height:36px;display:flex;align-items:center;justify-content:center}
.ok-s-side>.lbl>span{padding:0 12px;height:34px;line-height:34px;border-radius:17px;background:${rgba(INK, 0.8)};font-size:22px;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-s-side.ready>.lbl>span{background:${css(PALETTE.gold)};color:${css(INK)};font-size:24px}
.ok-s-side.ready .ok-s-plank{animation:oks-glow .9s ease-in-out infinite alternate}
@keyframes oks-glow{from{box-shadow:0 8px 0 ${rgba(INK, 0.45)},0 0 0 0 rgba(255,214,80,0),inset 0 4px 0 rgba(255,236,190,.35)}to{box-shadow:0 8px 0 ${rgba(INK, 0.45)},0 0 30px 12px rgba(255,214,80,.95),inset 0 4px 0 rgba(255,236,190,.35)}}
.ok-s-dot{position:absolute;right:-8px;top:-12px;min-width:40px;height:40px;padding:0 8px;border-radius:20px;background:${css(PALETTE.danger)};border:4px solid ${css(INK)};color:#fff;font-size:23px;line-height:32px;text-align:center;animation:oks-pulse 1.1s ease-in-out infinite;pointer-events:none}
@keyframes oks-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}
.ok-s-tray{position:absolute;left:0;top:0;width:${W}px;height:600px;border-radius:40px 40px 0 0;background:linear-gradient(180deg,${rgba(INK, 0.9)},${rgba(INK, 0.96)} 160px);box-shadow:inset 0 5px 0 rgba(255,255,255,.14),0 -6px 0 ${rgba(INK, 0.25)};pointer-events:auto;touch-action:none}
.ok-s-trim{position:absolute;left:0;top:-14px;width:${W}px;height:22px;border-radius:12px;border:5px solid ${css(INK)};background:${WOOD};pointer-events:none}
.ok-s-sel{position:absolute;top:16px;height:${TAB_BAR_H - 22}px;border-radius:30px;background:radial-gradient(ellipse at 50% 40%,${rgba(PALETTE.gold, 0.42)},${rgba(PALETTE.gold, 0.12)} 70%);box-shadow:inset 0 0 0 3px ${rgba(PALETTE.gold, 0.55)};pointer-events:none}
.ok-s-tab{position:absolute;top:0;height:${TAB_BAR_H}px;pointer-events:auto;cursor:pointer;touch-action:none}
.ok-s-tab>.lbl{position:absolute;left:2px;right:2px;top:104px;text-align:center;font-size:24px;line-height:1;color:${css(PALETTE.cream)};opacity:.78;white-space:nowrap}
.ok-s-tab.on>.lbl{color:${css(PALETTE.gold)};opacity:1}
.ok-s-med{position:absolute;left:50%;top:18px;width:80px;height:80px;margin-left:-40px;border-radius:50%;border:5px solid ${css(INK)};box-shadow:0 5px 0 ${rgba(0, 0.45)},inset 0 -7px 0 rgba(0,0,0,.18),inset 0 5px 0 rgba(255,255,255,.35);transition:transform .16s ${EASE.backOut};filter:saturate(.7) brightness(.85)}
.ok-s-med>canvas{position:absolute;left:-5px;top:-5px}
.ok-s-tab.on .ok-s-med{transform:translateY(-8px) scale(1.12);filter:none}
.ok-s-tab.home .ok-s-med{top:-30px;width:122px;height:122px;margin-left:-61px;border-width:6px;filter:none;box-shadow:0 7px 0 ${rgba(0, 0.45)},0 0 0 6px ${rgba(INK, 0.9)},inset 0 -9px 0 rgba(0,0,0,.18),inset 0 6px 0 rgba(255,255,255,.4)}
.ok-s-tab.home .ok-s-med>canvas{left:-6px;top:-6px}
.ok-s-tab.home.on .ok-s-med{transform:translateY(-6px) scale(1.06)}
.ok-s-tab.down .ok-s-med{transform:scale(1.14,.8)}
.ok-s-tab.home.down .ok-s-med{transform:scale(1.1,.84)}
.ok-s-tab>.ok-s-dot{right:auto;left:calc(50% + 18px);top:8px}
.ok-s-tab.home>.ok-s-dot{left:calc(50% + 34px);top:-34px}
.ok-s-pane{position:absolute;left:0;top:0;width:${W}px;height:1280px}
.ok-s-scrim{position:absolute;left:-2000px;top:-2000px;width:${W + 4000}px;height:${1280 + 4000}px;background:${rgba(INK, 0.5)};pointer-events:auto;touch-action:none}
.ok-s-board{position:absolute;border-radius:30px;border:6px solid ${css(INK)};background:${WOOD};box-shadow:0 12px 0 ${rgba(INK, 0.45)},inset 0 5px 0 rgba(255,236,190,.35),inset 0 -8px 0 rgba(60,25,8,.35)}
.ok-s-sheet{position:absolute;border-radius:24px;background:${rgba(INK, 0.78)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.14)}
.ok-calm .ok-s-dot,.ok-calm .ok-s-side.ready .ok-s-plank{animation:none}
`;

let styled = false;
function injectShellStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** h:mm:ss (or m:ss under an hour) */
function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function createShell(ui: Ui, parent: HTMLElement, hooks: ShellHooks): Shell {
  injectShellStyle();
  const calm = calmMotion();
  const t = ui.t;
  const home = hooks.home;
  let root: HTMLElement | null = null;
  let tab: TabId = 'home';
  let labels: Label[] = [];
  let intervals: number[] = [];
  const badges = new Map<TabId, number | '!'>();
  let tabEls = new Map<TabId, HTMLElement>();
  let sel: HTMLElement | null = null;
  let events: HTMLElement | null = null;
  let weapons: HTMLElement | null = null;
  let weaponsPane: WeaponsPane | null = null;
  /** the Weapons pane changed the save since this world was made */
  let dirty = false;
  /** where a full-screen tab returns */
  let ret: TabId = 'home';
  let powerEl: HTMLElement | null = null;
  let coinsEl: HTMLElement | null = null;
  let chipEl: HTMLElement | null = null;
  let weaponsMed: HTMLCanvasElement | null = null;
  let countUp = 0;
  let paneTop = 0;
  let paneBot = 1280;
  let dailyDot: HTMLElement | null = null;
  /** the side buttons (they belong to Home: away while Events is up) */
  let sideParts: HTMLElement[] = [];

  const tabX = (id: TabId): { x: number; w: number } => {
    const i = TAB_IDS.indexOf(id);
    const x = i < 2 ? i * SIDE_W : i === 2 ? 2 * SIDE_W : 2 * SIDE_W + HOME_W + (i - 3) * SIDE_W;
    return { x, w: id === 'home' ? HOME_W : SIDE_W };
  };

  function drop(): void {
    for (const i of intervals) window.clearInterval(i);
    intervals = [];
    for (const l of labels) l.destroy();
    labels = [];
    tabEls = new Map();
    dropRefs();
    root?.remove();
    root = null;
    resetHome();
  }

  function dropRefs(): void {
    weaponsPane?.destroy();
    weaponsPane = null;
    window.cancelAnimationFrame(countUp);
    sel = events = weapons = dailyDot = powerEl = coinsEl = chipEl = weaponsMed = null;
    sideParts = [];
  }

  function resetHome(): void {
    for (const a of home.getAnimations()) a.cancel();
    home.style.display = '';
    home.style.transform = '';
  }

  /** a moving part: enters from `away` (a CSS transform) after `delay` ms */
  function part(g: HTMLElement, x: number, y: number, away: string, delay: number, quiet: boolean): HTMLElement {
    const p = el('div', 'ok-s-part', g);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    if (!quiet && !calm) p.animate([{ transform: away, opacity: 0 }, { transform: 'none', opacity: 1 }], { delay, duration: 520, easing: EASE.backOut, fill: 'backwards' });
    return p;
  }

  /** a horizontal swipe on `e` moves one tab over (capture phase: it wins over the tab under the finger) */
  function swipeable(e: HTMLElement): void {
    let x0 = 0;
    let y0 = 0;
    let id = -1;
    e.addEventListener(
      'pointerdown',
      (ev) => {
        id = ev.pointerId;
        x0 = ev.clientX;
        y0 = ev.clientY;
      },
      true,
    );
    e.addEventListener(
      'pointerup',
      (ev) => {
        if (ev.pointerId !== id) return;
        id = -1;
        const r = ui.stage.root.getBoundingClientRect();
        const k = r.width / W;
        const dx = (ev.clientX - x0) / k;
        const dy = (ev.clientY - y0) / k;
        if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        ev.stopPropagation();
        for (const d of Array.from(e.querySelectorAll('.down'))) d.classList.remove('down');
        const i = TAB_IDS.indexOf(tab) + (dx < 0 ? 1 : -1);
        const next = TAB_IDS[Math.max(0, Math.min(TAB_IDS.length - 1, i))]!;
        if (next !== tab) {
          ui.audio.play('tap');
          select(next, true);
        }
      },
      true,
    );
  }

  // ---------------------------------------------------------------- build

  function build(quiet: boolean): void {
    const game = ui.game;
    const save = game.save.data;
    const view = ui.view?.() ?? { top: 0, bottom: 1280 };
    const top = Math.max(-400, view.top);
    const bot = Math.min(1680, view.bottom);
    root = el('div', 'ok-group', parent);
    if (calm) root.classList.add('ok-calm');
    const rank = rankOf(progressScore(save).total);

    // ---- Weapons and Events panes (under the bars, hidden until their tab; Weapons is built on first use)
    paneTop = top;
    paneBot = bot;
    weapons = el('div', 'ok-s-pane', root);
    weapons.style.display = 'none';
    swipeable(weapons);
    events = el('div', 'ok-s-pane', root);
    events.style.display = 'none';
    buildEvents(events, top, bot);
    swipeable(events);

    // ---- top bar: rank chip (opens the ranks) with the power, coins, sound
    const barP = part(root, 0, top, 'translateY(-130px)', 0, quiet);
    const bar = el('div', 'ok-s-bar', barP);
    const chip = el('div', 'ok-s-chip ok-s-glass', bar);
    chip.dataset.testid = 'shell-rank';
    iconCanvas(chip, 76, 76, (g) => drawBadge(g.phaser, 38, 40, 24, rank, 0));
    const chipText = el('div', '', chip);
    chipText.style.minWidth = '0';
    fitText(el('div', 't1', chipText), t(`rank.${RANKS[rank]!.id}`), 28, 230);
    const pow = el('div', 'ok-s-pow', chipText);
    pow.dataset.testid = 'shell-power';
    iconCanvas(pow, 22, 28, (g) => drawBolt(g, 11, 14));
    el('b', '', pow).textContent = t('shell.power');
    powerEl = el('span', '', pow);
    powerEl.textContent = String(powerOf(save));
    chipEl = chip;
    pressable(chip, () => root !== null, ui.unlock, () => {
      ui.audio.play('tap');
      select('ranks', true);
    });
    const coins = el('div', 'ok-s-coins ok-s-glass', bar);
    coins.dataset.testid = 'shell-coins';
    iconCanvas(coins, 48, 48, (g) => drawCoin(g.phaser, 24, 24, 17));
    coinsEl = el('span', '', coins);
    coinsEl.textContent = String(save.coins);
    const sndP = part(root, 658, top + 60, 'translateY(-130px)', 60, quiet);
    const snd = roundButton(sndP, 0, 0, 92, ui.audio.muted ? 'sound-off' : 'sound-on', ui.unlock, () => {
      const muted = ui.audio.toggleMute();
      snd.setIcon(muted ? 'sound-off' : 'sound-on');
      snd.el.setAttribute('aria-label', t(muted ? 'core.soundOff' : 'core.soundOn'));
      if (!muted) ui.audio.play('pop');
    });
    snd.el.classList.add('ok-s-round');
    snd.el.dataset.testid = 'shell-sound';
    snd.el.setAttribute('aria-label', t(ui.audio.muted ? 'core.soundOff' : 'core.soundOn'));

    // ---- side buttons, left edge under the chapter card: free chest, daily
    const sideY = top + 640;
    const chestP = part(root, 76, sideY, 'translateX(-200px)', 140, quiet);
    const chest = el('div', 'ok-s-side', chestP);
    chest.dataset.testid = 'shell-chest';
    const chestPlank = el('div', 'ok-s-plank', chest);
    iconCanvas(chestPlank, 112, 112, (g) => drawChest(g, 56, 60));
    const chestLbl = el('span', '', el('div', 'lbl', chest));
    const refreshChest = (): void => {
      const wait = freeChestWait(ui.game.save.data.arsenal, Date.now());
      chest.classList.toggle('ready', wait === 0);
      chestLbl.textContent = wait === 0 ? t('shell.chestOpen') : clock(wait);
      chest.setAttribute('aria-label', wait === 0 ? t('shell.freeChest') : t('shell.chestIn', { t: clock(wait) }));
    };
    refreshChest();
    intervals.push(window.setInterval(refreshChest, 500));
    pressable(chest, () => root !== null, ui.unlock, () => {
      const got: { kind: ChestKind | null; n: number } = { kind: null, n: 0 };
      // claimFreeChest may move the timer even when it says no (a clock moved back): persist either way
      ui.game.save.update((d) => {
        got.kind = claimFreeChest(d, Date.now(), false);
        if (got.kind) d.arsenal.chests.push(got.kind);
        got.n = d.arsenal.chests.length;
      });
      refreshChest();
      if (got.kind) {
        ui.audio.playPreset(SFX.loot);
        chestPlank.animate([{ transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'scale(0.9) rotate(4deg)', offset: 0.5 }, { transform: 'none' }], { duration: 520, easing: EASE.backOut });
        hooks.toast(t('shell.chestGot'), t('shell.chestQueued', { n: got.n }));
        hooks.changed();
      } else {
        ui.audio.play('tap');
        chestPlank.animate([{ transform: 'rotate(-7deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'none' }], { duration: 360 });
      }
    });

    const dailyP = part(root, 76, sideY + 176, 'translateX(-200px)', 200, quiet);
    const daily = el('div', 'ok-s-side', dailyP);
    daily.dataset.testid = 'title-daily';
    const dailyPlank = el('div', 'ok-s-plank', daily);
    iconCanvas(dailyPlank, 112, 112, (g) => drawCalendarGlyph(g, 56, 58, false));
    el('span', '', el('div', 'lbl', daily)).textContent = t('title.daily');
    dailyDot = el('div', 'ok-s-dot', daily);
    dailyDot.textContent = '!';
    pressable(daily, () => root !== null, ui.unlock, () => {
      ui.audio.play('tap');
      select('events', true);
    });
    sideParts = [chestP, dailyP];

    // ---- tab bar along the bottom edge
    const tabP = part(root, 0, bot - TAB_BAR_H, `translateY(${TAB_BAR_H + 80}px)`, 60, quiet);
    const tray = el('div', 'ok-s-tray', tabP);
    tray.dataset.ui = '1';
    el('div', 'ok-s-trim', tabP);
    sel = el('div', 'ok-s-sel', tabP);
    const tabs = el('div', 'ok-s-part', tabP);
    tabs.style.cssText = 'left:0;top:0';
    swipeable(tabP);
    for (const id of TAB_IDS) {
      const { x, w } = tabX(id);
      const tb = el('div', `ok-s-tab ${id}`, tabs);
      tb.style.left = `${x}px`;
      tb.style.width = `${w}px`;
      tb.dataset.testid = `tab-${id}`;
      // the caption first: the element's text is its label (store/tools taps buttons by their text)
      const lbl = el('div', 'lbl', tb);
      fitText(lbl, t(TAB_KEY[id]), id === 'home' ? 26 : 24, w - 8);
      const size = id === 'home' ? 122 : 80;
      const med = el('div', 'ok-s-med', tb);
      const tint = TAB_TINT[id];
      med.style.background = `radial-gradient(circle at 34% 28%, ${css(mix(tint, 0xffffff, 0.45))}, ${css(tint)} 58%, ${css(mix(tint, INK, 0.25))})`;
      // the old title test ids ride on the tabs that took their place
      if (id === 'shop') med.dataset.testid = 'title-shop';
      if (id === 'weapons') med.dataset.testid = 'title-forge';
      if (id === 'ranks') med.dataset.testid = 'title-ranks';
      const icon = iconCanvas(med, size, size, (g) => {
        const c = size / 2;
        const k = size / 80;
        g.fillStyle(0xffffff, 0.22).fillCircle(c, c, 30 * k);
        drawTabIcon(g, id, c, c, k, rank, save);
      });
      if (id === 'weapons') weaponsMed = icon;
      const dot = el('div', 'ok-s-dot', tb);
      dot.style.display = 'none';
      tabEls.set(id, tb);
      pressable(tb, () => root !== null, ui.unlock, () => {
        ui.audio.play('tap');
        select(id, true);
      });
      if (!quiet && !calm) med.animate([{ transform: 'scale(0)' }, { transform: 'none' }], { delay: 260 + TAB_IDS.indexOf(id) * 60, duration: 420, easing: EASE.backOut, fill: 'backwards' });
    }
    for (const [id, n] of badges) paintBadge(id, n);
  }

  function buildEvents(pane: HTMLElement, top: number, bot: number): void {
    const game = ui.game;
    const save = game.save.data;
    const scrim = el('div', 'ok-s-scrim', pane);
    scrim.dataset.ui = '1';
    const y0 = top + 150;
    const y1 = bot - TAB_BAR_H - 40;
    const h = Math.min(760, y1 - y0);
    const cy = y0 + (y1 - y0) / 2;
    const board = el('div', 'ok-s-board', pane);
    board.style.cssText = `left:${CX - 320}px;top:${cy - h / 2}px;width:640px;height:${h}px`;
    const L = (l: Label): Label => {
      labels.push(l);
      return l;
    };
    const head = cy - h / 2;
    L(new Label(pane, CX, head + 62, t('events.title'), { size: 60, color: PALETTE.gold, stroke: 16, shadowY: 6, shadowColor: 0x5a2d12 }));
    const sheet = el('div', 'ok-s-sheet', pane);
    const sh = Math.min(400, h - 250);
    sheet.style.cssText = `left:${CX - 280}px;top:${head + 118}px;width:560px;height:${sh}px`;
    const ch = dailyChallenge(todayKey());
    const sy = head + 118;
    const cal = iconCanvas(pane, 96, 96, (g) => drawCalendarGlyph(g, 48, 50, false));
    cal.style.cssText += `;position:absolute;left:${CX - 48}px;top:${sy + 14}px`;
    L(new Label(pane, CX, sy + 140, t('events.daily'), { size: 38, color: PALETTE.cream, stroke: 9 }));
    const d1 = L(new Label(pane, CX, sy + 186, todayKey(), { size: 26, color: PALETTE.gold, stroke: 6 }));
    void d1;
    const goal = L(new Label(pane, CX, sy + 238, t('title.dailyGoal', { n: ch.goal, m: t(`mod.${ch.mod}`) }), { size: 28, color: PALETTE.cream, stroke: 7 }));
    if (goal.width > 520) goal.setScale(520 / goal.width);
    const info = L(new Label(pane, CX, sy + 282, t('title.dailyInfo'), { size: 24, color: PALETTE.cream, stroke: 6 }));
    if (info.width > 520) info.setScale(520 / info.width);
    const done = save.dailyDone === todayKey();
    const streak = L(new Label(pane, CX, sy + 330, done ? t('events.done') : t('title.dailyStreak', { n: liveStreak(save, todayKey()) }), { size: 26, color: done ? PALETTE.heal : PALETTE.gold, stroke: 7 }));
    if (streak.width > 520) streak.setScale(520 / streak.width);
    const by = head + 118 + sh + 70;
    const b = button(pane, CX, by, game.daily ? t('events.exit') : t('events.play'), ui.unlock, () => {
      ui.audio.play('tap');
      hooks.daily();
    }, { width: 460, height: 100, fontSize: 40 });
    b.el.dataset.testid = 'events-daily';
    if (by + 80 < head + h) L(new Label(pane, CX, Math.min(head + h - 36, by + 92), t('events.more'), { size: 24, color: PALETTE.cream, stroke: 6 })).el.style.opacity = '0.75';
  }

  function paintBadge(id: TabId, n: number | '!'): void {
    const tb = tabEls.get(id);
    const dot = tb?.querySelector<HTMLElement>('.ok-s-dot');
    if (dot) {
      dot.style.display = n === 0 ? 'none' : '';
      dot.textContent = n === 0 ? '' : n === '!' ? '!' : n > 99 ? '99+' : String(n);
    }
    if (id === 'events' && dailyDot) dailyDot.style.display = n === 0 ? 'none' : '';
  }

  function paneOf(id: TabId): HTMLElement | null {
    return id === 'home' ? home : id === 'events' ? events : id === 'weapons' ? weapons : null;
  }

  function moveSel(id: TabId, animate: boolean): void {
    if (!sel) return;
    const { x, w } = tabX(id);
    const from = { left: sel.style.left, width: sel.style.width };
    sel.style.left = `${x + 6}px`;
    sel.style.width = `${w - 12}px`;
    if (animate && !calm && from.left) sel.animate([{ left: from.left, width: from.width }, { left: `${x + 6}px`, width: `${w - 12}px` }], { duration: 300, easing: EASE.backOut });
    for (const [k, e] of tabEls) e.classList.toggle('on', k === id);
  }

  /** slide the content panes from `a` to `b` (Home and Events have content of their own) */
  function slide(a: TabId, b: TabId, animate: boolean): void {
    const pa = paneOf(a);
    const pb = paneOf(b);
    if (!pb || pa === pb) return;
    const dir = TAB_IDS.indexOf(b) > TAB_IDS.indexOf(a) ? 1 : -1;
    for (const p of [pa, pb]) if (p) for (const an of p.getAnimations()) an.cancel();
    pb.style.display = '';
    pb.style.transform = '';
    if (!pa) return;
    if (!animate || calm) {
      pa.style.display = 'none';
      return;
    }
    pb.animate([{ transform: `translateX(${dir * W}px)` }, { transform: 'none' }], { duration: 380, easing: EASE.cubicOut });
    const out = pa.animate([{ transform: 'none' }, { transform: `translateX(${-dir * W}px)` }], { duration: 380, easing: EASE.cubicOut, fill: 'forwards' });
    out.onfinish = () => {
      if (tab === b || paneOf(tab) !== pa) {
        pa.style.display = 'none';
        out.cancel();
      }
    };
  }

  /** the side buttons in (Home) or out (Events) */
  function sides(on: boolean, animate: boolean): void {
    sideParts.forEach((p, i) => {
      for (const a of p.getAnimations()) a.cancel();
      p.style.visibility = '';
      const out = [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-200px)', opacity: 0 }];
      if (!animate || calm) {
        p.style.visibility = on ? '' : 'hidden';
        return;
      }
      const a = p.animate(on ? [...out].reverse() : out, { duration: 300, delay: on ? 120 + i * 60 : i * 40, easing: on ? EASE.backOut : EASE.cubicIn, fill: on ? 'backwards' : 'forwards' });
      if (!on) a.onfinish = () => {
        p.style.visibility = 'hidden';
        a.cancel();
      };
    });
  }

  function select(next: TabId, animate: boolean): void {
    if (!root || next === tab) return;
    const prev = tab;
    tab = next;
    moveSel(next, animate);
    // the full-screen tabs: the highlight shows where we went; the screen covers the rest, and closing
    // it builds a new world (so a change made in the Weapons pane is picked up there too)
    if (next === 'shop' || next === 'ranks') {
      if (paneOf(prev)) ret = prev;
      (next === 'shop' ? hooks.shop : hooks.ranks)();
      return;
    }
    // leaving the Weapons pane after a change: a new world first, then the shell on `next`
    if (prev === 'weapons' && dirty) {
      dirty = false;
      hooks.rebuild(next);
      return;
    }
    if (next === 'weapons' && weapons && !weaponsPane) weaponsPane = createWeaponsPane(ui, weapons, paneTop, paneBot, weaponsHooks, !animate);
    const from = paneOf(prev) ? prev : ret;
    sides(next === 'home', animate);
    slide(from, next, animate);
  }

  const weaponsHooks = {
    changed: (before: number) => {
      dirty = true;
      bump(before);
      hooks.changed();
    },
    looks: () => {
      ui.audio.play('tap');
      select('shop', true);
    },
    toast: (head: string, sub: string) => hooks.toast(head, sub),
  };

  /** the top bar after a change: POWER counts up from `before`, the coins follow, the Weapons medallion shows the selected weapon */
  function bump(before: number): void {
    const d = ui.game.save.data;
    const now = powerOf(d);
    if (coinsEl) coinsEl.textContent = String(d.coins);
    if (weaponsMed) {
      const c = weaponsMed.getContext('2d')!;
      const m = c.getTransform();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, weaponsMed.width, weaponsMed.height);
      c.setTransform(m);
      const g = new Gfx(c);
      g.fillStyle(0xffffff, 0.22).fillCircle(40, 40, 30);
      drawTabIcon(g, 'weapons', 40, 40, 1, 0, d);
    }
    const p = powerEl;
    if (!p) return;
    window.cancelAnimationFrame(countUp);
    if (calm || now === before) {
      p.textContent = String(now);
      return;
    }
    const t0 = performance.now();
    const dur = 700;
    const step = (): void => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - (1 - u) ** 3;
      p.textContent = String(Math.round(before + (now - before) * e));
      if (u < 1) countUp = window.requestAnimationFrame(step);
    };
    step();
    chipEl?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 700, easing: EASE.backOut });
    p.animate([{ color: '#fff' }, { color: css(PALETTE.heal), offset: 0.2 }, { color: css(PALETTE.heal), offset: 0.8 }, { color: '#fff' }], { duration: 900 });
  }

  return {
    get shown() {
      return root !== null;
    },
    get tab() {
      return tab;
    },
    get returnTab() {
      return ret;
    },
    show(next, opts) {
      const quiet = opts?.quiet ?? false;
      if (!root) {
        tab = 'home';
        build(quiet);
        moveSel('home', false);
        resetHome();
      }
      if (next !== tab) select(next, !quiet);
    },
    badge(id, n) {
      badges.set(id, n);
      paintBadge(id, n);
    },
    hide(instant = false) {
      const r = root;
      if (!r) return;
      for (const i of intervals) window.clearInterval(i);
      intervals = [];
      const gone = labels;
      labels = [];
      tabEls = new Map();
      dropRefs();
      root = null;
      tab = 'home';
      ret = 'home';
      // a new world follows (or the run starts from this one, which the Home tab already brought up to date)
      dirty = false;
      resetHome();
      if (instant || calm) {
        for (const l of gone) l.destroy();
        r.remove();
        return;
      }
      r.style.pointerEvents = 'none';
      for (const e of Array.from(r.querySelectorAll<HTMLElement>('[data-ui]'))) e.removeAttribute('data-ui');
      const a = r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE.cubicIn, fill: 'forwards' });
      a.onfinish = () => {
        for (const l of gone) l.destroy();
        r.remove();
      };
    },
    relayout() {
      if (!root) return;
      const keep = tab;
      drop();
      tab = 'home';
      build(true);
      moveSel('home', false);
      if (keep === 'events' || keep === 'weapons') select(keep, false);
    },
  };
}

// ---------------------------------------------------------------------------- drawings

/** A tab's glyph, centred on (x, y); `k` scales the 80 px medallion design. */
function drawTabIcon(g: Gfx, id: TabId, x: number, y: number, k: number, rank: number, save: SaveData): void {
  if (id === 'shop') {
    drawCoin(g.phaser, x - 12 * k, y + 8 * k, 15 * k);
    drawCoin(g.phaser, x + 12 * k, y + 8 * k, 15 * k);
    drawCoin(g.phaser, x, y - 10 * k, 16 * k);
  } else if (id === 'weapons') {
    // the selected weapon
    const sel = save.arsenal.selected;
    drawWeaponIcon(g, sel, x, y + 2 * k, 0.56 * k, { level: save.arsenal.weapons[sel].level });
  } else if (id === 'ranks') {
    drawBadge(g.phaser, x, y + 2 * k, 24 * k, rank, 0);
  } else if (id === 'events') {
    g.at(x, y, k * 0.85, k * 0.85, 0, () => drawCalendarGlyph(g, 0, 0, false));
  } else {
    drawHouse(g, x, y + 2 * k, k * 0.95);
  }
}

/** The Home tab: a little cottage with a red roof and a round door. */
function drawHouse(g: Gfx, x: number, y: number, k: number): void {
  g.fillStyle(INK, 1).fillRoundedRect(x - 22 * k, y - 6 * k, 44 * k, 34 * k, 6 * k);
  g.fillStyle(PALETTE.cream, 1).fillRoundedRect(x - 18 * k, y - 4 * k, 36 * k, 28 * k, 4 * k);
  g.fillStyle(INK, 1).fillTriangle(x - 32 * k, y + 1 * k, x + 32 * k, y + 1 * k, x, y - 32 * k);
  g.fillStyle(PALETTE.danger, 1).fillTriangle(x - 25 * k, y - 3 * k, x + 25 * k, y - 3 * k, x, y - 27 * k);
  g.fillStyle(INK, 1).fillRoundedRect(x - 8 * k, y + 6 * k, 16 * k, 20 * k, 7 * k);
  g.fillStyle(PALETTE.bowLight, 1).fillRoundedRect(x - 5 * k, y + 9 * k, 10 * k, 17 * k, 5 * k);
  g.fillStyle(0xffffff, 0.45).fillTriangle(x - 18 * k, y - 5 * k, x - 4 * k, y - 5 * k, x - 4 * k, y - 18 * k);
}

/** The free chest: a wooden chest with a gold band and lock. */
function drawChest(g: Gfx, x: number, y: number): void {
  g.fillStyle(INK, 1).fillRoundedRect(x - 40, y - 30, 80, 62, 12);
  g.fillStyle(0x8a4f22, 1).fillRoundedRect(x - 35, y - 4, 70, 31, 7);
  g.fillStyle(0xc47e3e, 1).fillRoundedRect(x - 35, y - 26, 70, 22, 10);
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(x - 30, y - 23, 40, 6, 3);
  g.fillStyle(INK, 1).fillRect(x - 38, y - 6, 76, 6);
  g.fillStyle(PALETTE.gold, 1).fillRect(x - 25, y - 26, 9, 53).fillRect(x + 16, y - 26, 9, 53);
  g.fillStyle(INK, 1).fillRoundedRect(x - 11, y - 12, 22, 24, 6);
  g.fillStyle(PALETTE.gold, 1).fillRoundedRect(x - 8, y - 9, 16, 18, 4);
  g.fillStyle(INK, 1).fillCircle(x, y - 2, 3).fillRect(x - 1.5, y - 1, 3, 6);
}

/** The power bolt beside POWER. */
function drawBolt(g: Gfx, x: number, y: number): void {
  const pts = (s: number, dx: number, dy: number) => [
    { x: x + (3 * s) + dx, y: y - 13 * s + dy },
    { x: x - 8 * s + dx, y: y + 2 * s + dy },
    { x: x - 1 * s + dx, y: y + 2 * s + dy },
    { x: x - 4 * s + dx, y: y + 13 * s + dy },
    { x: x + 8 * s + dx, y: y - 3 * s + dy },
    { x: x + 1 * s + dx, y: y - 3 * s + dy },
  ];
  g.fillStyle(INK, 1).fillPoints(pts(1.12, 0, 0));
  g.fillStyle(PALETTE.gold, 1).fillPoints(pts(0.85, 0, 0));
}

/**
 * The chest opening: a full-screen moment over the menu (or the result card) that shows what a
 * chest gave. The save changes first (`ChestPlay.take`, one `save.update`), so nothing is lost if
 * the app dies mid-animation; the screen only shows the loot it got back.
 *
 * Sequence: the chest drops in and shakes (three knocks, each harder), the lid pops off with a burst
 * of light and sparkles, the coins count up, then each shard flies from the chest into its weapon's
 * card one by one (the card's bar fills, "+n", "upgrade ready" when it now can level up). A newly
 * unlocked weapon (the sling) gets a full-screen reveal. A tap skips to the summary; reduced motion
 * (`calmMotion`: prefers-reduced-motion, ?fx=0, ?calm=1) shows the summary at once, without movement.
 * The chest's odds line under its name is printed straight from `CHEST_ODDS` (as the shop's sheet).
 *
 * Where chests are opened (the flow, see hud.ts / shell.ts / shop.ts / screens.ts):
 * - the free chest and a chest bought in the shop open right away (they were asked for just now);
 * - a run's chest: the result card offers "Open chest" (exactly that run's chest, `arsenal.runChest`);
 *   left closed, it waits in the line like the boss and daily chests;
 * - the line (`arsenal.chests`): the Home tab's chest pile button (shown with a count while any
 *   wait) opens them oldest first, "Next chest (n)" between them, "Later" to stop;
 * - the migration's welcome gold chest: presented once, the first time the menu comes up
 *   (`arsenal.welcome`).
 */
import { drawCoin } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { canUpgrade, powerOf, upgradeCost, type ChestKind, type WeaponState } from '@sim/arsenal';
import { CHEST_ODDS, SLING_UNLOCK_SHARDS, type ChestLoot } from '@sim/chests';
import type { SaveData } from '@sim/meta';
import { unlockFeats } from '@sim/progress';
import { WEAPON_IDS, type WeaponId } from '@sim/weapons';
import { button, calmMotion, EASE, el, fitText, iconCanvas, mix } from './dom';
import { css, type Gfx, rgba } from './gfx';
import { featLine } from './progress';
import type { Ui } from './screens';
import { CHEST_LOOK } from './shop';
import { drawShard, drawWeaponIcon, WEAPON_TINT } from './weapons';

/** Applies one chest to the save (inside `save.update`) and says what it gave; null: nothing to open. */
export type ChestTake = (d: SaveData) => { kind: ChestKind; loot: ChestLoot } | null;

export interface ChestPlay {
  take: ChestTake;
  /** the line behind this chest: "Next chest (n)" opens the next one while `left` says any wait */
  more?: { take: ChestTake; left: (d: SaveData) => number };
  /** a heading in place of the chest's name, and a line under it (the welcome gift) */
  title?: string;
  sub?: string;
  /** the screen closed: `power` is POWER before the first chest (the top bar counts up from it) */
  done?: (power: number) => void;
}

export interface ChestScreen {
  readonly shown: boolean;
  /** opens the first chest (the save changes now) and plays it; false, with nothing shown, when `take` gave nothing */
  play(p: ChestPlay): boolean;
  /** away at once (no `done`) */
  close(): void;
}

export interface ChestHooks {
  toast: (head: string, sub: string) => void;
}

interface Opening {
  kind: ChestKind;
  loot: ChestLoot;
  /** the shard stacks' weapons before and after the chest */
  before: Record<WeaponId, WeaponState>;
  after: Record<WeaponId, WeaponState>;
  /** weapons of this chest that can level up now */
  ready: WeaponId[];
}

const INK = PALETTE.ink;
const CX = 360;
/** the big chest's scale over drawChestIcon's 80 × 62 design */
const S = 3;
const CW = 320;
const CH = 280;
/** where the chest's design origin sits in its canvases */
const OX = CW / 2;
const OY = 170;

const STYLE = `
.ok-c{position:absolute;left:0;top:0;width:720px;height:1280px}
.ok-c-scrim{position:absolute;left:-2000px;top:-2000px;width:4720px;height:5280px;background:${rgba(INK, 0.93)};pointer-events:auto;touch-action:none}
.ok-c-p{position:absolute;width:0;height:0}
.ok-c-h{position:absolute;left:30px;width:660px;text-align:center;font-size:58px;line-height:1.1;color:${css(PALETTE.gold)};-webkit-text-stroke:12px ${css(INK)};paint-order:stroke fill;white-space:nowrap}
.ok-c-sub{position:absolute;left:60px;width:600px;text-align:center;font-size:24px;line-height:1.25;color:#fff;-webkit-text-stroke:6px ${css(INK)};paint-order:stroke fill}
.ok-c-odds{position:absolute;left:110px;width:500px;height:40px;border-radius:20px;background:${rgba(0xffffff, 0.08)};display:flex;align-items:center;justify-content:center;gap:14px;font-size:20px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-c-odds span{display:flex;align-items:center;gap:4px}
.ok-c-rays{position:absolute;left:-380px;top:-380px;width:760px;height:760px;border-radius:50%;-webkit-mask-image:radial-gradient(circle,#000 18%,transparent 68%);mask-image:radial-gradient(circle,#000 18%,transparent 68%);animation:okc-spin 14s linear infinite;pointer-events:none}
@keyframes okc-spin{to{transform:rotate(360deg)}}
.ok-c-glow{position:absolute;left:-170px;top:-170px;width:340px;height:340px;border-radius:50%;pointer-events:none}
.ok-c-shadow{position:absolute;left:-130px;top:94px;width:260px;height:40px;border-radius:50%;background:${rgba(0x000000, 0.35)}}
.ok-c-chest{position:absolute;left:${-OX}px;top:${-OY}px;width:${CW}px;height:${CH}px}
.ok-c-chest>canvas{position:absolute;left:0;top:0}
.ok-c-spark{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;pointer-events:none}
.ok-c-coins{position:absolute;left:0;width:720px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:64px;line-height:1;color:${css(PALETTE.coin)};-webkit-text-stroke:12px ${css(INK)};paint-order:stroke fill;white-space:nowrap}
.ok-c-cards{position:absolute;left:0;width:720px;display:flex;justify-content:center;gap:18px}
.ok-c-card{position:relative;width:224px;height:250px;border-radius:26px;background:${rgba(INK, 0.9)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.16),0 6px 0 ${rgba(0x000000, 0.4)};display:flex;flex-direction:column;align-items:center;padding:12px 10px 0;gap:8px}
.ok-c-plate{position:relative;width:200px;height:132px;border-radius:20px;box-shadow:inset 0 0 0 4px ${rgba(INK, 0.45)},inset 0 -8px 0 rgba(0,0,0,.16);overflow:hidden;flex:none}
.ok-c-plate>canvas{position:absolute;left:0;top:0}
.ok-c-name{font-size:26px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-c-bar{position:relative;width:190px;height:32px;border-radius:16px;background:${css(INK)};box-shadow:inset 0 0 0 2px rgba(255,255,255,.16);overflow:hidden;flex:none}
.ok-c-bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:16px;background:linear-gradient(180deg,#c8adff,#a77bff);transition:width .18s ease-out}
.ok-c-bar.full>i{background:linear-gradient(180deg,#a8f0b8,#4cc96a)}
.ok-c-bar.max>i{background:linear-gradient(180deg,#ffe9a0,${css(PALETTE.gold)})}
.ok-c-bar>span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:4px;font-size:21px;line-height:1;color:#fff;text-shadow:0 2px 0 ${css(INK)},0 0 3px ${css(INK)}}
.ok-c-lv{position:absolute;left:8px;top:8px;height:30px;padding:0 11px;border-radius:15px;background:${css(INK)};color:${css(PALETTE.gold)};font-size:20px;line-height:30px;white-space:nowrap}
.ok-c-plus{position:absolute;right:-12px;top:-16px;min-width:64px;height:48px;padding:0 10px;border-radius:24px;background:#a77bff;border:4px solid ${css(INK)};color:#fff;font-size:28px;line-height:40px;text-align:center;white-space:nowrap}
.ok-c-tag{position:absolute;left:50%;bottom:-20px;transform:translateX(-50%);height:38px;padding:0 14px;border-radius:19px;border:4px solid ${css(INK)};font-size:20px;line-height:30px;white-space:nowrap;color:${css(INK)}}
.ok-c-tag.up{background:${css(PALETTE.heal)}}
.ok-c-tag.new{background:${css(PALETTE.gold)}}
.ok-c-skip{position:absolute;left:0;width:720px;text-align:center;font-size:24px;color:${css(PALETTE.cream)};opacity:.7;pointer-events:none}
.ok-c-fly{position:absolute;pointer-events:none}
.ok-c-rev{position:absolute;left:0;top:0;width:720px;height:1280px}
.ok-c-rev .ok-c-scrim{background:${rgba(mix(INK, 0x000000, 0.3), 0.93)}}
.ok-c-orb{position:absolute;left:-150px;top:-150px;width:300px;height:300px;border-radius:50%;border:8px solid ${css(INK)};box-shadow:0 10px 0 ${rgba(0x000000, 0.4)},inset 0 -12px 0 rgba(0,0,0,.18),inset 0 8px 0 rgba(255,255,255,.35)}
.ok-c-orb>canvas{position:absolute;left:-8px;top:-8px}
.ok-c-desc{position:absolute;left:80px;width:560px;text-align:center;font-size:26px;line-height:1.3;color:${css(PALETTE.cream)}}
.ok-c-calm .ok-c-rays{animation:none}
`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

const snapshot = (d: SaveData): Record<WeaponId, WeaponState> => {
  const out = {} as Record<WeaponId, WeaponState>;
  for (const id of WEAPON_IDS) out[id] = { ...d.arsenal.weapons[id] };
  return out;
};

/** shards a weapon in this state collects towards its next step: unlock (the sling), a level, or none (top level) */
const needOf = (w: WeaponState): number | null => (!w.owned ? SLING_UNLOCK_SHARDS : (upgradeCost(w.level)?.shards ?? null));

export function createChestScreen(ui: Ui, parent: HTMLElement, hooks: ChestHooks): ChestScreen {
  injectStyle();
  const t = ui.t;
  let root: HTMLElement | null = null;
  let play: ChestPlay | null = null;
  let power = 0;
  let timers: number[] = [];
  /** shard flights in the air */
  const flights = new Set<Animation>();
  let raf = 0;
  /** the animation is running (a tap skips to the summary) */
  let running = false;
  let feats: string[] = [];

  function later(ms: number, fn: () => void): void {
    timers.push(window.setTimeout(fn, ms));
  }

  function stop(): void {
    for (const id of timers) window.clearTimeout(id);
    timers = [];
    // shards still in the air: cancelled (no onfinish, so no late landing on a card that is gone)
    for (const a of flights) a.cancel();
    flights.clear();
    window.cancelAnimationFrame(raf);
    running = false;
  }

  function apply(take: ChestTake): Opening | null {
    let o: Opening | null = null;
    ui.game.save.update((d) => {
      const before = snapshot(d);
      const r = take(d);
      if (!r) return;
      const ids = r.loot.shards.map((s) => s.weapon);
      o = { kind: r.kind, loot: r.loot, before, after: snapshot(d), ready: ids.filter((id) => canUpgrade(d, id)) };
      feats.push(...unlockFeats(d, null));
    });
    return o;
  }

  function close(): void {
    stop();
    root?.remove();
    root = null;
    play = null;
  }

  function finish(): void {
    const p = play;
    const got = feats;
    close();
    feats = [];
    p?.done?.(power);
    for (const id of got) hooks.toast(t('feat.title'), featLine(t, id));
  }

  /** the frame's rows really on screen */
  function frame(): { top: number; bot: number } {
    const v = ui.view?.() ?? { top: 0, bottom: 1280 };
    return { top: Math.max(-400, v.top), bot: Math.min(1680, v.bottom) };
  }

  function show(o: Opening, animate: boolean): void {
    stop();
    root?.remove();
    const calm = calmMotion();
    const anim = animate && !calm;
    const r = el('div', 'ok-c', parent);
    if (calm) r.classList.add('ok-c-calm');
    root = r;
    r.dataset.testid = 'chest-screen';
    r.dataset.kind = o.kind;
    const scrim = el('div', 'ok-c-scrim', r);
    scrim.dataset.ui = '1';
    scrim.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      ui.unlock();
    });
    scrim.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      // a tap while it plays: straight to the summary
      if (running && root === r) show(o, false);
    });
    if (anim) scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });

    const { top, bot } = frame();
    const span = bot - top;
    const cy = Math.round(top + Math.max(390, Math.min(span * 0.4, 520)));
    const look = CHEST_LOOK[o.kind];

    // ---- heading: the chest (or the welcome gift), its odds as the roll uses them
    const h = el('div', 'ok-c-h', r);
    h.style.top = `${top + 96}px`;
    fitText(h, play?.title ?? t(`chest.${o.kind}`), 58, 640);
    let y = top + 172;
    if (play?.sub) {
      const s = el('div', 'ok-c-sub', r);
      s.style.top = `${y}px`;
      s.textContent = play.sub;
      y += 70;
    }
    const od = CHEST_ODDS[o.kind];
    const odds = el('div', 'ok-c-odds', r);
    odds.dataset.testid = 'chest-odds';
    odds.style.top = `${y}px`;
    const o1 = el('span', '', odds);
    iconCanvas(o1, 22, 22, (g) => drawCoin(g.phaser, 11, 11, 8.5));
    el('em', '', o1).textContent = `${od.coins[0]}–${od.coins[1]}`;
    const o2 = el('span', '', odds);
    iconCanvas(o2, 22, 24, (g) => drawShard(g, 11, 12, 0.72));
    el('em', '', o2).textContent = `${od.shards[0]}–${od.shards[1]}`;
    el('span', '', odds).textContent = `${t('odds.sling')} ${t('odds.pct', { n: Math.round(od.newWeaponChance * 1000) / 10 })}`;

    // ---- the chest: light behind it, the body, the lid (a canvas of its own, so it can fly off)
    const c = el('div', 'ok-c-p', r);
    c.style.left = `${CX}px`;
    c.style.top = `${cy}px`;
    const rays = el('div', 'ok-c-rays', c);
    rays.style.background = `repeating-conic-gradient(from 0deg,${rgba(mix(look.band, 0xffffff, 0.3), 0.55)} 0deg 9deg,transparent 9deg 22.5deg)`;
    const glow = el('div', 'ok-c-glow', c);
    glow.style.background = `radial-gradient(circle,${rgba(0xfff2b0, 0.95)} 0%,${rgba(look.lid, 0.45)} 38%,transparent 70%)`;
    el('div', 'ok-c-shadow', c);
    const box = el('div', 'ok-c-chest', c);
    const shut = iconCanvas(box, CW, CH, (g) => drawChestBody(g, o.kind, false));
    const open = iconCanvas(box, CW, CH, (g) => drawChestBody(g, o.kind, true));
    const lid = iconCanvas(box, CW, CH, (g) => drawChestLid(g, o.kind));
    lid.style.transformOrigin = `${OX}px ${OY - 20 * S}px`;
    const sparkLayer = el('div', 'ok-c-p', c);

    // ---- coins
    const coins = el('div', 'ok-c-coins', r);
    coins.dataset.testid = 'chest-coins';
    coins.style.top = `${cy + 128}px`;
    iconCanvas(coins, 64, 64, (g) => drawCoin(g.phaser, 32, 32, 25));
    const coinN = el('span', '', coins);

    // ---- one card per shard stack
    const cards = el('div', 'ok-c-cards', r);
    cards.style.top = `${cy + 228}px`;
    const stacks = o.loot.shards.map((s) => card(cards, o, s.weapon, s.n));

    // ---- the buttons (once it has played)
    const btnY = Math.min(bot - 96, cy + 228 + 250 + 110);
    const skip = el('div', 'ok-c-skip', r);
    skip.style.top = `${btnY - 16}px`;
    skip.textContent = t('chest.tapSkip');

    const summary = (): void => {
      running = false;
      skip.remove();
      shut.style.display = 'none';
      lid.style.display = 'none';
      open.style.display = '';
      rays.style.opacity = '1';
      glow.style.opacity = '1';
      coins.style.visibility = '';
      coinN.textContent = `+${o.loot.coins}`;
      for (const k of stacks) k.final();
      if (o.loot.unlocked) reveal(r, o.loot.unlocked, false, () => buttons(r, btnY));
      else buttons(r, btnY);
    };

    if (!anim) {
      summary();
      if (animate) ui.audio.playPreset(SFX.loot);
      return;
    }

    // ---- the animated sequence
    running = true;
    open.style.display = 'none';
    rays.style.opacity = '0';
    glow.style.opacity = '0';
    coins.style.visibility = 'hidden';
    for (const k of stacks) k.start();
    // drop in
    box.animate([{ transform: 'translateY(-560px) scale(.7)' }, { transform: 'translateY(0) scale(1.08,.86)', offset: 0.7 }, { transform: 'none' }], { duration: 520, easing: EASE.quadOut });
    later(380, () => ui.audio.playPreset(SFX.thock));
    // three knocks, each harder
    const knocks = [0.5, 0.8, 1.15];
    knocks.forEach((k, i) => {
      later(700 + i * 380, () => {
        ui.audio.playPreset(SFX.thock, { volume: 0.5 + i * 0.2, pitch: i * 2 });
        const a = 6 * k;
        box.animate(
          [
            { transform: 'none' },
            { transform: `rotate(${-a}deg) scale(${1 + 0.04 * k},${1 - 0.06 * k})` },
            { transform: `rotate(${a}deg) translateY(${-10 * k}px)` },
            { transform: `rotate(${-a * 0.5}deg)` },
            { transform: 'none' },
          ],
          { duration: 300, easing: EASE.sine },
        );
        lid.animate([{ transform: 'none' }, { transform: `translateY(${-8 * k}px)` }, { transform: 'none' }], { duration: 240 });
        sparks(sparkLayer, 3 + i * 2, 70, look.band);
      });
    });
    // the lid pops
    const tPop = 700 + knocks.length * 380 + 120;
    later(tPop, () => {
      ui.audio.playPreset(SFX.loot);
      ui.audio.play('pop');
      shut.style.display = 'none';
      open.style.display = '';
      lid.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(40px,-240px) rotate(28deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(70px,-300px) rotate(40deg)', opacity: 0 }], { duration: 700, easing: EASE.cubicOut, fill: 'forwards' });
      box.animate([{ transform: 'scale(1.16,.84)' }, { transform: 'scale(.94,1.08)', offset: 0.5 }, { transform: 'none' }], { duration: 420, easing: EASE.backOut });
      rays.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 500, easing: EASE.backOut, fill: 'forwards' });
      glow.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.3 }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, easing: EASE.cubicOut, fill: 'forwards' });
      sparks(sparkLayer, 18, 230, 0xfff2b0);
    });
    // the coins count up
    const tCoins = tPop + 380;
    const countMs = 750;
    later(tCoins, () => {
      coins.style.visibility = '';
      coins.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE.backOut });
      ui.audio.play('coin');
      const t0 = performance.now();
      const step = (): void => {
        const u = Math.min(1, (performance.now() - t0) / countMs);
        coinN.textContent = `+${Math.round(o.loot.coins * (1 - (1 - u) ** 3))}`;
        if (u < 1) raf = window.requestAnimationFrame(step);
        else coins.animate([{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 260, easing: EASE.backOut });
      };
      step();
      flyCoins(sparkLayer, coins, cy);
    });
    // the shards, one by one into their cards
    let at = tCoins + countMs - 100;
    const gap = 130;
    const flight = 560;
    o.loot.shards.forEach((s, si) => {
      const k = stacks[si]!;
      later(at - 200, () => k.enter());
      for (let i = 0; i < s.n; i++) {
        later(at + i * gap, () => {
          const to = k.target();
          fly(r, cy - 40, to, flight, () => {
            k.add();
            ui.audio.playPreset(SFX.plink, { pitch: i });
          });
        });
      }
      at += s.n * gap + flight + 120;
    });
    later(at + 150, () => {
      if (root !== r) return;
      for (const k of stacks) k.final();
      running = false;
      skip.remove();
      if (o.loot.unlocked) reveal(r, o.loot.unlocked, true, () => buttons(r, btnY));
      else buttons(r, btnY);
    });
  }

  /** a weapon's card: plate, name, the shard bar (counts up as shards land), "+n", "upgrade ready" / "new" */
  function card(parent: HTMLElement, o: Opening, id: WeaponId, n: number): { start(): void; enter(): void; target(): { x: number; y: number }; add(): void; final(): void } {
    const b = o.before[id];
    const a = o.after[id];
    const tint = WEAPON_TINT[id];
    const e = el('div', 'ok-c-card', parent);
    e.dataset.testid = `chest-card-${id}`;
    const plate = el('div', 'ok-c-plate', e);
    plate.style.background = `radial-gradient(circle at 50% 38%,${css(mix(tint, 0xffffff, 0.4))},${css(tint)} 62%,${css(mix(tint, INK, 0.3))})`;
    const iconAt = (locked: boolean): HTMLCanvasElement => iconCanvas(plate, 200, 132, (g) => drawWeaponIcon(g, id, 100, 68, 0.95, { level: locked ? 1 : a.level, silhouette: locked }));
    let icon = iconAt(!b.owned);
    const lv = el('div', 'ok-c-lv', plate);
    lv.textContent = b.owned ? t('weapons.lv', { n: b.level }) : '';
    lv.style.display = b.owned ? '' : 'none';
    fitText(el('div', 'ok-c-name', e), t(`weapon.${id}`), 26, 200);
    const bar = el('div', 'ok-c-bar', e);
    const fill = el('i', '', bar);
    const txt = el('span', '', bar);
    let count = 0;
    const paint = (w: WeaponState, shards: number): void => {
      const need = needOf(w);
      bar.classList.toggle('max', need === null);
      bar.classList.toggle('full', need !== null && shards >= need);
      fill.style.width = `${need === null ? 100 : Math.min(100, (shards / need) * 100)}%`;
      txt.textContent = '';
      txt.appendChild(iconCanvas(txt, 20, 22, (g) => drawShard(g, 10, 11, 0.66)));
      // enough for the next step (a level, or the unlock): say so instead of "4/2"
      txt.append(need === null ? `${shards}` : shards >= need ? t('chest.enough', { n: shards }) : `${shards}/${need}`);
    };
    let plus: HTMLElement | null = null;
    const tags = (): void => {
      if (o.loot.unlocked === id) {
        const tg = el('div', 'ok-c-tag new', e);
        fitText(tg, t('chest.newTag'), 20, 190);
      } else if (o.ready.includes(id)) {
        const tg = el('div', 'ok-c-tag up', e);
        tg.dataset.testid = 'chest-up-ready';
        fitText(tg, t('chest.upReady'), 20, 190);
      }
    };
    return {
      start() {
        paint(b, b.shards);
        e.style.visibility = 'hidden';
      },
      enter() {
        e.style.visibility = '';
        e.animate([{ transform: 'translateY(60px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE.backOut });
      },
      target() {
        const host = root?.getBoundingClientRect();
        const pr = plate.getBoundingClientRect();
        const k = host && host.width ? host.width / 720 : 1;
        return host ? { x: (pr.left + pr.width / 2 - host.left) / k, y: (pr.top + pr.height / 2 - host.top) / k } : { x: CX, y: 900 };
      },
      add() {
        count += 1;
        paint(b, b.shards + count);
        if (!plus) plus = el('div', 'ok-c-plus', e);
        plus.textContent = `+${count}`;
        plus.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 200, easing: EASE.backOut });
        e.animate([{ transform: 'scale(1.08,.92)' }, { transform: 'none' }], { duration: 200, easing: EASE.backOut });
      },
      final() {
        e.style.visibility = '';
        if (!b.owned && a.owned) {
          icon.remove();
          icon = iconAt(false);
          plate.prepend(icon);
          lv.textContent = t('weapons.lv', { n: a.level });
          lv.style.display = '';
        }
        paint(a, a.shards);
        if (!plus) plus = el('div', 'ok-c-plus', e);
        plus.textContent = `+${n}`;
        if (!e.querySelector('.ok-c-tag')) tags();
      },
    };
  }

  /** a shard from the chest's mouth along an arc into a card */
  function fly(layer: HTMLElement, fromY: number, to: { x: number; y: number }, ms: number, land: () => void): void {
    const s = iconCanvas(layer, 48, 54, (g) => drawShard(g, 24, 27, 1.5), 'ok-c-fly');
    const x0 = CX + (Math.random() - 0.5) * 60;
    const y0 = fromY;
    const cx = (x0 + to.x) / 2 + (Math.random() - 0.5) * 160;
    const cyy = Math.min(y0, to.y) - 180 - Math.random() * 80;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const x = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * to.x;
      const y = (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cyy + u * u * to.y;
      const sc = u < 0.2 ? 0.4 + u * 3 : 1 - (u - 0.2) * 0.45;
      frames.push({ transform: `translate(${x - 24}px,${y - 27}px) rotate(${u * 540}deg) scale(${sc})`, offset: u });
    }
    s.style.transform = String(frames[0]!.transform);
    const a = s.animate(frames, { duration: ms, easing: 'cubic-bezier(.45,0,.75,1)', fill: 'forwards' });
    flights.add(a);
    a.onfinish = () => {
      flights.delete(a);
      s.remove();
      land();
    };
  }

  /** a little burst of light dots around the chest */
  function sparks(layer: HTMLElement, n: number, reach: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const p = el('div', 'ok-c-spark', layer);
      p.style.background = `radial-gradient(circle,#fff 0 30%,${rgba(color, 0.9)} 45%,transparent 72%)`;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const d = reach * (0.55 + Math.random() * 0.45);
      const x = Math.cos(ang) * d;
      const y = Math.sin(ang) * d - 30;
      const sc = 0.7 + Math.random() * 1.1;
      const a = p.animate(
        [
          { transform: `translate(0,-40px) scale(${sc})`, opacity: 1 },
          { transform: `translate(${x}px,${y}px) scale(${sc})`, opacity: 1, offset: 0.7 },
          { transform: `translate(${x * 1.1}px,${y * 1.1 + 30}px) scale(0)`, opacity: 0 },
        ],
        { duration: 600 + Math.random() * 400, easing: EASE.cubicOut, fill: 'forwards' },
      );
      a.onfinish = () => p.remove();
    }
  }

  /** coins jump out of the chest towards the counter */
  function flyCoins(layer: HTMLElement, counter: HTMLElement, cy: number): void {
    const host = root?.getBoundingClientRect();
    const cr = counter.getBoundingClientRect();
    const k = host && host.width ? host.width / 720 : 1;
    const ty = host ? (cr.top + cr.height / 2 - host.top) / k - cy : 150;
    for (let i = 0; i < 9; i++) {
      const cv = iconCanvas(layer, 36, 36, (g) => drawCoin(g.phaser, 18, 18, 14), 'ok-c-fly');
      cv.style.left = '-18px';
      cv.style.top = '-18px';
      const x = (Math.random() - 0.5) * 300;
      const a = cv.animate(
        [
          { transform: 'translate(0,-40px) scale(.5)' },
          { transform: `translate(${x}px,${-150 - Math.random() * 90}px) scale(1)`, offset: 0.45 },
          { transform: `translate(${x * 0.15 - 60}px,${ty}px) scale(.7)`, opacity: 0.2 },
        ],
        { duration: 650, delay: i * 45, easing: EASE.sine, fill: 'both' },
      );
      a.onfinish = () => cv.remove();
    }
  }

  /** a new weapon: the full-screen reveal, then `next` */
  function reveal(r: HTMLElement, id: WeaponId, animate: boolean, next: () => void): void {
    const tint = WEAPON_TINT[id];
    const m = el('div', 'ok-c-rev', r);
    m.dataset.testid = 'chest-reveal';
    const sc = el('div', 'ok-c-scrim', m);
    sc.dataset.ui = '1';
    sc.addEventListener('pointerdown', (e) => e.stopPropagation());
    sc.addEventListener('pointerup', (e) => e.stopPropagation());
    const { top, bot } = frame();
    const oy = Math.round(top + (bot - top) * 0.42);
    const p = el('div', 'ok-c-p', m);
    p.style.left = `${CX}px`;
    p.style.top = `${oy}px`;
    const rays = el('div', 'ok-c-rays', p);
    rays.style.cssText += ';left:-520px;top:-520px;width:1040px;height:1040px';
    rays.style.background = `repeating-conic-gradient(from 0deg,${rgba(mix(tint, 0xffffff, 0.35), 0.6)} 0deg 8deg,transparent 8deg 20deg)`;
    const glow = el('div', 'ok-c-glow', p);
    glow.style.cssText += ';left:-260px;top:-260px;width:520px;height:520px';
    glow.style.background = `radial-gradient(circle,${rgba(0xffffff, 0.8)} 0%,${rgba(tint, 0.5)} 40%,transparent 70%)`;
    const orb = el('div', 'ok-c-orb', p);
    orb.style.background = `radial-gradient(circle at 34% 28%,${css(mix(tint, 0xffffff, 0.5))},${css(tint)} 58%,${css(mix(tint, INK, 0.3))})`;
    iconCanvas(orb, 300, 300, (g) => drawWeaponIcon(g, id, 150, 150, 1.75, { level: 1 }));
    const h = el('div', 'ok-c-h', m);
    h.style.top = `${oy - 300}px`;
    fitText(h, t('chest.newWeapon'), 64, 640);
    const name = el('div', 'ok-c-h', m);
    name.style.top = `${oy + 180}px`;
    name.style.color = '#fff';
    fitText(name, t(`weapon.${id}`), 56, 640);
    const desc = el('div', 'ok-c-desc', m);
    desc.style.top = `${oy + 260}px`;
    desc.textContent = t(`weapon.desc.${id}`);
    const ok = button(m, CX, Math.min(bot - 110, oy + 420), t('chest.great'), ui.unlock, () => {
      ui.audio.play('tap');
      m.remove();
      next();
    }, { width: 380, height: 104, fontSize: 42 });
    ok.el.dataset.testid = 'chest-reveal-ok';
    if (!animate) return;
    ui.audio.playPreset(SFX.fanfare);
    ui.audio.play('win');
    sc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    rays.animate([{ transform: 'scale(.2) rotate(-40deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: EASE.cubicOut });
    glow.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 800, easing: EASE.cubicOut });
    orb.animate([{ transform: 'scale(0) rotate(-200deg)' }, { transform: 'scale(1.15) rotate(10deg)', offset: 0.7 }, { transform: 'none' }], { duration: 750, delay: 150, easing: EASE.cubicOut, fill: 'backwards' });
    h.animate([{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 650, easing: EASE.backOut, fill: 'backwards' });
    name.animate([{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, delay: 850, easing: EASE.backOut, fill: 'backwards' });
    desc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1000, fill: 'backwards' });
    ok.el.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 1150, easing: EASE.backOut, fill: 'backwards' });
    sparks(p, 24, 330, tint);
  }

  /** "Next chest (n)" + "Later" while the line has more, else "Collect" */
  function buttons(r: HTMLElement, y: number): void {
    if (root !== r) return;
    const p = play;
    const left = p?.more ? p.more.left(ui.game.save.data) : 0;
    const calm = calmMotion();
    const made: HTMLElement[] = [];
    if (left > 0 && p?.more) {
      const more = p.more;
      const later = button(r, CX - 170, y, t('chest.later'), ui.unlock, () => {
        ui.audio.play('tap');
        finish();
      }, { width: 300, height: 104, fontSize: 38, variant: 'secondary' });
      later.el.dataset.testid = 'chest-later';
      const nx = button(r, CX + 160, y, t('chest.next', { n: left }), ui.unlock, () => {
        ui.audio.play('tap');
        const o = apply(more.take);
        if (o) show(o, true);
        else finish();
      }, { width: 320, height: 104, fontSize: 38 });
      nx.el.dataset.testid = 'chest-next';
      made.push(later.el, nx.el);
    } else {
      const ok = button(r, CX, y, t('chest.collect'), ui.unlock, () => {
        ui.audio.play('tap');
        finish();
      }, { width: 420, height: 104, fontSize: 42 });
      ok.el.dataset.testid = 'chest-collect';
      made.push(ok.el);
    }
    if (!calm) made.forEach((b, i) => b.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: i * 70, easing: EASE.backOut, fill: 'backwards' }));
  }

  return {
    get shown() {
      return root !== null;
    },
    play(p) {
      if (root) return false;
      const before = powerOf(ui.game.save.data);
      feats = [];
      const o = apply(p.take);
      if (!o) return false;
      play = p;
      power = before;
      show(o, true);
      return true;
    },
    close,
  };
}

// ---------------------------------------------------------------------------- drawings

/** The big chest's body (drawChestIcon's design, below the lid seam); `open`: the inside shows, glowing. */
function drawChestBody(g: Gfx, kind: ChestKind, open: boolean): void {
  const k = CHEST_LOOK[kind];
  g.at(OX, OY, S, S, 0, () => {
    if (open) {
      // the back wall, the glowing inside and a few coins peeking over the rim
      g.fillStyle(INK, 1).fillRoundedRect(-40, -22, 80, 28, 10);
      g.fillStyle(mix(k.body, INK, 0.5), 1).fillRoundedRect(-35, -18, 70, 20, 6);
      g.fillStyle(0xffd86b, 0.9).fillRoundedRect(-31, -12, 62, 12, 5);
      g.fillStyle(0xfff6d0, 0.95).fillRoundedRect(-24, -10, 48, 6, 3);
      drawCoin(g.phaser, -16, -9, 6);
      drawCoin(g.phaser, 15, -10, 5.5);
      drawCoin(g.phaser, 2, -12, 6.5);
    }
    g.fillStyle(INK, 1).fillRoundedRect(-40, -6, 80, 38, 12).fillRect(-40, -6, 80, 12);
    g.fillStyle(k.body, 1).fillRoundedRect(-35, -1, 70, 28, 7);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(-31, 1, 62, 5, 2);
    g.fillStyle(k.band, 1).fillRect(-25, -1, 9, 28).fillRect(16, -1, 9, 28);
    g.fillStyle(INK, 1).fillRect(-38, -6, 76, 5);
    // the lock hangs on the front
    g.fillStyle(INK, 1).fillRoundedRect(-11, -8, 22, 22, 6);
    g.fillStyle(k.lock, 1).fillRoundedRect(-8, -5, 16, 16, 4);
    g.fillStyle(INK, 1).fillCircle(0, 1, 3).fillRect(-1.5, 2, 3, 6);
  });
}

/** The big chest's lid (above the seam). */
function drawChestLid(g: Gfx, kind: ChestKind): void {
  const k = CHEST_LOOK[kind];
  g.at(OX, OY, S, S, 0, () => {
    g.fillStyle(INK, 1).fillRoundedRect(-40, -30, 80, 26, 12).fillRect(-40, -16, 80, 12);
    g.fillStyle(k.lid, 1).fillRoundedRect(-35, -26, 70, 20, 10);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-30, -23, 40, 6, 3);
    g.fillStyle(k.band, 1).fillRect(-25, -26, 9, 20).fillRect(16, -26, 9, 20);
    if (kind === 'boss') {
      g.fillStyle(INK, 1).fillTriangle(-34, -22, -20, -26, -34, -42).fillTriangle(34, -22, 20, -26, 34, -42);
      g.fillStyle(PALETTE.cream, 1).fillTriangle(-31, -25, -23, -27, -31, -36).fillTriangle(31, -25, 23, -27, 31, -36);
    }
    if (kind === 'gold') g.fillStyle(0xffffff, 0.85).fillCircle(26, -18, 3);
  });
}

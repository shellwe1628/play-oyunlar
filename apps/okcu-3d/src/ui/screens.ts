/**
 * The overlays: title (GameScene.buildTitle), card pick (GameScene.openCards / buildCardFaces /
 * onPickCard / onExtra) and the result card (core ResultScene shell + games/okcu ResultScene
 * lines, revive and double coins). Same positions, sizes, colours and timings as the 2D game, in
 * its logical px. The rewarded buttons (▶ AD) go through `Ui.rewarded` (the platform adapter).
 */
import type { Audio } from '@oyun/core/pure';
import { drawBadge, drawBowItem } from '@okcu/scenes/gear';
import { drawCardIcon, drawCoin } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { bowTier } from '@sim/bow';
import { countCards, synergyFor, type CardId, type SynergyId } from '@sim/cards';
import { CHAPTERS } from '@sim/chapters';
import { dailyChallenge, liveStreak, progressScore, RANKS, rankOf } from '@sim/progress';
import type { World } from '@sim/world';
import type { Game, Stage } from '../contract';
import { button, EASE, el, Label, menuTile, pressable, roundButton, Sketch, type ButtonHandle } from './dom';
import { Gfx, rgba } from './gfx';
import type { RunResult } from './progress';
import { todayKey } from './save';

export type T = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface Ui {
  stage: Stage;
  game: Game;
  layer: HTMLElement;
  t: T;
  audio: Audio;
  /** create/resume the audio context (must run inside a pointer gesture) */
  unlock: () => void;
  /**
   * Show a rewarded ad for `placement`; true only when it was watched ('granted'). On 'unavailable'
   * the neutral core.noAd notice shows. The caller checks that its screen is still up before granting.
   */
  rewarded: (placement: string) => Promise<boolean>;
}

const CX = 360;

// ---------------------------------------------------------------------------- title

export interface TitleScreen {
  readonly shown: boolean;
  show(w: World): void;
  hide(): void;
  /** a tap instead of a drag: the hint jumps */
  nudge(): void;
  clear(): void;
}

/** The title's buttons (GameScene.buildTitle): upgrades, forge, ranks; daily; the chapter select. */
export interface TitleHooks {
  shop: () => void;
  forge: () => void;
  ranks: () => void;
  daily: () => void;
  chapter: () => void;
}

export function createTitle(ui: Ui, parent: HTMLElement, hooks: TitleHooks): TitleScreen {
  let root: HTMLElement | null = null;
  let hint: Label | null = null;
  let labels: Label[] = [];
  let buttons: ButtonHandle[] = [];
  let boing = 0;
  let pulse: Animation | null = null;

  function drop(): void {
    window.clearInterval(boing);
    for (const l of labels) l.destroy();
    labels = [];
    buttons = [];
    hint = null;
    pulse = null;
    root?.remove();
    root = null;
  }

  const startPulse = (): void => {
    if (!hint) return;
    pulse = hint.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }], { duration: 520, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
  };

  return {
    get shown() {
      return root !== null;
    },
    show(w) {
      drop();
      const t = ui.t;
      const quick = ui.game.quick;
      const save = ui.game.save.data;
      const daily = ui.game.daily;
      root = el('div', 'ok-group', parent);
      const logoY = quick ? 230 : 262;
      if (!quick) {
        const box = el('div', 'ok-anchor', root);
        box.style.left = `${CX}px`;
        box.style.top = `${logoY}px`;
        const logo = new Label(box, 0, 0, t('title.name'), { size: 68, color: PALETTE.cream, wrap: 690, stroke: 18, shadowY: 10 });
        labels.push(logo);
        // living detail: an arrow stuck in the last letter that boings every few seconds
        const arrow = el('canvas', '', box);
        const px = 3;
        arrow.width = 150 * px;
        arrow.height = 130 * px;
        const ax = logo.width / 2 - 70;
        const ay = -logo.height / 2 + 22;
        arrow.style.cssText = `width:150px;height:130px;left:${ax - 30}px;top:${ay - 100}px;transform-origin:30px 100px`;
        const g = new Gfx(arrow.getContext('2d')!);
        g.ctx.setTransform(px * 1.3, 0, 0, px * 1.3, 30 * px, 100 * px);
        g.lineStyle(9, PALETTE.ink, 1).lineBetween(0, 0, 54, -40);
        g.lineStyle(5, PALETTE.shaftLight, 1).lineBetween(0, 0, 54, -40);
        g.fillStyle(PALETTE.ink, 1).fillTriangle(42, -40, 60, -27, 64, -56);
        g.fillStyle(PALETTE.fletch, 1).fillTriangle(45, -39, 58, -30, 61, -51);
        box.animate([{ transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2.5deg)' }], { duration: 1100, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
        boing = window.setInterval(() => {
          arrow.animate([{ transform: 'rotate(-14deg)' }, { transform: 'rotate(7deg)', offset: 0.3 }, { transform: 'rotate(-3deg)', offset: 0.55 }, { transform: 'rotate(1deg)', offset: 0.78 }, { transform: 'rotate(0deg)' }], { duration: 700, easing: 'ease-out' });
        }, 3200);
        logo.el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 500, easing: EASE.backOut });
      }
      const subY = logoY + (quick ? 0 : 96);
      if (daily) {
        // the daily state is spelled out: whose seed, that upgrades are off, today's goal
        const key = todayKey();
        const ch = dailyChallenge(key);
        const panel = el('div', '', root);
        panel.style.cssText = `position:absolute;left:${CX - 330}px;top:${subY - 34}px;width:660px;height:178px;border-radius:26px;background:${rgba(PALETTE.ink, 0.72)}`;
        labels.push(new Label(root, CX, subY, t('title.dailyOn', { d: key }), { size: 36, color: PALETTE.gold }));
        labels.push(new Label(root, CX, subY + 50, t('title.dailyGoal', { n: ch.goal, m: t(`mod.${ch.mod}`) }), { size: 30, color: PALETTE.cream, wrap: 620 }));
        // one line, shrunk to fit (wrapped, the Turkish line ran into the hint below the panel)
        const info = new Label(root, CX, subY + 100, `${t('title.dailyInfo')} · ${t('title.dailyStreak', { n: liveStreak(save, key) })}`, { size: 26, color: PALETTE.cream });
        if (info.width > 630) info.setScale(630 / info.width);
        labels.push(info);
      } else {
        // rank badge + rank and bow, the player's standing at a glance
        const r = rankOf(progressScore(save).total);
        const level = ui.game.bowLevel;
        const tl = new Label(root, CX + 28, subY, `${t(`rank.${RANKS[r]!.id}`)} · ${t('bow.name', { name: t(`bow.${bowTier(level)}`), n: level })}`, { size: 34, color: PALETTE.gold, stroke: 10 });
        labels.push(tl);
        const bx = CX + 28 - tl.width / 2 - 14;
        const badge = new Sketch(root, bx - 40, subY - 40, 80, 80);
        drawBadge(badge.begin().phaser, bx, subY, 22, r, 0);
        // the best wave and, beside it, the coins in the bank (the 2D title shows them only in the shop)
        const best = save.best > 0 ? t('title.best', { n: save.best }) : '';
        const coins = String(save.coins);
        const bestL = new Label(root, CX, subY + 46, best, { size: 30, color: PALETTE.cream, stroke: 8 });
        labels.push(bestL);
        if (save.coins > 0 || save.runs > 0) {
          const coinL = new Label(root, 0, subY + 46, coins, { size: 30, color: PALETTE.coin, stroke: 8, originX: 0 });
          labels.push(coinL);
          const gap = best ? 34 : 0;
          const total = bestL.width + gap + 34 + coinL.width;
          const x0 = CX - total / 2;
          bestL.setPos(x0 + bestL.width / 2, subY + 46);
          const cx = x0 + bestL.width + gap + 14;
          const coin = new Sketch(root, cx - 20, subY + 26, 40, 40);
          drawCoin(coin.begin().phaser, cx, subY + 46, 14);
          coinL.setPos(cx + 20, subY + 46);
        }
        if (w.startChapter > 0) labels.push(new Label(root, CX, subY + 84, t('title.hand', { n: w.cards.length }), { size: 28, color: PALETTE.cream, stroke: 8 }));
      }
      // the hint, kept above the highest spot the first archer can stand (its head is never above y ≈ 520)
      const hintY = Math.min(subY + (daily ? 200 : w.startChapter > 0 ? 136 : 100), 500);
      hint = new Label(root, CX, hintY, t('title.drag'), { size: 50, color: PALETTE.white, wrap: 640, stroke: 14 });
      labels.push(hint);
      startPulse();
      // one menu bar of equal icon tiles: upgrades, forge, ranks, daily (sound is the HUD's corner
      // button to the right); under it, when there is a choice, the chapter select as one wide pill
      const row = 74;
      const tw = 136;
      const th = 128;
      const tx = (i: number): number => 22 + tw / 2 + i * (tw + 10);
      const tap = (fn: () => void) => () => {
        ui.audio.play('tap');
        fn();
      };
      const rank = rankOf(progressScore(save).total);
      buttons.push(menuTile(root, tx(0), row, tw, th, t('title.shop'), (g, x, y) => drawUpgradeGlyph(g, x, y), ui.unlock, tap(hooks.shop), { testid: 'title-shop' }));
      buttons.push(menuTile(root, tx(1), row, tw, th, t('title.forge'), (g, x, y) => drawBowItem(g.phaser, x, y, 30, ui.game.bowLevel, 0), ui.unlock, tap(hooks.forge), { primary: true, testid: 'title-forge' }));
      buttons.push(menuTile(root, tx(2), row, tw, th, t('title.ranks'), (g, x, y) => drawBadge(g.phaser, x, y, 30, rank, 0), ui.unlock, tap(hooks.ranks), { testid: 'title-ranks' }));
      buttons.push(menuTile(root, tx(3), row, tw, th, daily ? t('title.dailyExit') : t('title.daily'), (g, x, y) => drawCalendarGlyph(g, x, y, daily), ui.unlock, tap(hooks.daily), { testid: 'title-daily' }));
      if (!daily && save.chapter > 0) {
        const cw = 470;
        const pill = button(root, CX, 180, `${t('title.chapterPick', { c: t(`chapter.${Math.min(CHAPTERS, ui.game.chapter)}`) })}  ▾`, ui.unlock, tap(hooks.chapter), { width: cw, height: 88, fontSize: 32, variant: 'secondary' });
        pill.el.style.background = rgba(PALETTE.ink, 0.62);
        pill.el.dataset.testid = 'title-chapter';
        buttons.push(pill);
      }
      // the menu drops in one button after another (eased with an overshoot, 55 ms apart)
      buttons.forEach((b, i) => b.el.animate([{ transform: 'translateY(-36px) scale(0.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 120 + i * 55, duration: 320, easing: EASE.backOut, fill: 'backwards' }));
    },
    hide() {
      const r = root;
      if (!r) return;
      window.clearInterval(boing);
      for (const b of buttons) b.setEnabled(false);
      buttons = [];
      const gone = labels;
      labels = [];
      hint = null;
      root = null;
      const a = r.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-60px)' }], { duration: 260, easing: EASE.cubicIn, fill: 'forwards' });
      a.onfinish = () => {
        for (const l of gone) l.destroy();
        r.remove();
      };
    },
    nudge() {
      if (!hint) return;
      pulse?.cancel();
      const a = hint.el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 420, easing: EASE.backOut });
      a.onfinish = startPulse;
    },
    clear: drop,
  };
}

/** The upgrades tile: a chunky green arrow pointing up over an ink disc. */
function drawUpgradeGlyph(g: Gfx, x: number, y: number): void {
  g.fillStyle(PALETTE.ink, 0.35).fillCircle(x, y, 34);
  const arrow = (dx: number, dy: number, color: number): void => {
    g.fillStyle(color, 1).fillTriangle(x - 26 + dx, y - 2 + dy, x + 26 + dx, y - 2 + dy, x + dx, y - 30 + dy);
    g.fillRect(x - 11 + dx, y - 4 + dy, 22, 30);
  };
  arrow(0, 4, PALETTE.ink);
  arrow(0, 0, 0x7cf29c);
}

/** The daily tile: a calendar page with its rings and today's mark (a cross-out back to normal). */
function drawCalendarGlyph(g: Gfx, x: number, y: number, exit: boolean): void {
  g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 30, y - 26, 60, 58, 10);
  g.fillStyle(0xffffff, 1).fillRoundedRect(x - 25, y - 21, 50, 48, 7);
  g.fillStyle(PALETTE.danger, 1).fillRect(x - 25, y - 21, 50, 14);
  g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 17, y - 34, 8, 18, 4).fillRoundedRect(x + 9, y - 34, 8, 18, 4);
  if (exit) {
    g.lineStyle(7, PALETTE.ink, 1).lineBetween(x - 11, y - 1, x + 11, y + 19).lineBetween(x + 11, y - 1, x - 11, y + 19);
  } else {
    g.fillStyle(PALETTE.gold, 1).fillCircle(x, y + 9, 10);
    g.lineStyle(3, PALETTE.ink, 1).strokeCircle(x, y + 9, 10);
  }
}

// ---------------------------------------------------------------------------- cards

export interface CardScreen {
  readonly open: boolean;
  /** call every frame: opens on the card phase, rebuilds on a reroll, closes when the phase ends */
  sync(w: World, treasure: boolean): void;
  close(): void;
}

export function createCards(ui: Ui, parent: HTMLElement, onOpen: () => void, onSynergy: (id: SynergyId) => void): CardScreen {
  let root: HTMLElement | null = null;
  let faces: HTMLElement | null = null;
  let title: Label | null = null;
  let key = '';
  let picking = false;
  let cards: HTMLElement[] = [];
  /** bumped on every rebuild and close: late animation callbacks of old faces do nothing */
  let gen = 0;
  /** the +1 card ad is showing */
  let adPending = false;
  let extraBtn: ButtonHandle | null = null;

  /** GameScene.onExtra: a rewarded ad, then one more card in this offer (once per pick). */
  async function extra(): Promise<void> {
    const w = ui.game.w;
    if (picking || adPending || w.phase !== 'cards' || w.offerExtra) return;
    adPending = true;
    extraBtn?.setEnabled(false);
    const wave = w.wave;
    const ok = await ui.rewarded('extra_card');
    adPending = false;
    // a late answer for an offer that is gone (picked, restarted) grants nothing
    const still = ui.game.w === w && w.phase === 'cards' && w.wave === wave && !picking && root !== null;
    if (ok && still && ui.game.extraCard()) return; // the offer grew: sync() rebuilds the faces
    extraBtn?.setEnabled(!ui.game.w.offerExtra);
  }

  function close(): void {
    gen += 1;
    title?.destroy();
    title = null;
    root?.remove();
    root = null;
    faces = null;
    cards = [];
    extraBtn = null;
    key = '';
    picking = false;
  }

  function drawIcon(cv: HTMLCanvasElement, id: CardId, small: boolean): void {
    const px = 3;
    cv.width = cv.height = 150 * px;
    const g = new Gfx(cv.getContext('2d')!);
    const s = small ? 0.85 : 1;
    g.ctx.setTransform(px * s, 0, 0, px * s, 75 * px, 75 * px);
    drawCardIcon(g.phaser, id, 0, 0);
  }

  function pick(i: number): void {
    const w = ui.game.w;
    const id = w.offer[i];
    if (picking || !root || w.phase !== 'cards' || !id) return;
    picking = true;
    ui.audio.playPreset(SFX.pick);
    const syn = synergyFor(w.cards, id);
    if (syn) ui.audio.playPreset(SFX.fanfare, { volume: 0.7 });
    const mine = gen;
    cards.forEach((card, n) => {
      for (const a of card.getAnimations()) a.cancel();
      if (n === i) {
        const icon = card.querySelector<HTMLElement>('.ok-card-icon');
        if (icon) {
          for (const a of icon.getAnimations()) a.cancel();
          icon.animate([{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(360deg) scale(1.5)' }], { duration: 420, easing: EASE.backOut, fill: 'forwards' });
        }
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 240, easing: EASE.quadOut });
        const top = parseFloat(card.style.top) + parseFloat(card.style.height) / 2;
        card.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${40 - top}px) scale(0.2)`, opacity: 0 }], { delay: 260, duration: 260, easing: EASE.cubicIn, fill: 'forwards' });
      } else {
        card.animate([{ transform: 'none' }, { transform: `translateY(900px) rotate(${n < i ? -25 : 25}deg)` }], { duration: 420, easing: EASE.cubicIn, fill: 'forwards' });
      }
    });
    window.setTimeout(() => {
      if (mine !== gen) return;
      close();
      ui.game.pickCard(i); // its events arrive with the next frame's
      if (syn) onSynergy(syn);
    }, 540);
  }

  function build(w: World): void {
    if (!root) return;
    gen += 1;
    const mine = gen;
    faces?.remove();
    faces = el('div', 'ok-group', root);
    cards = [];
    const t = ui.t;
    const offer = w.offer;
    const n = offer.length;
    const ch = n > 4 ? 150 : n > 3 ? 168 : 196;
    const gap = n > 3 ? 14 : 22;
    const startY = 280 + ch / 2;
    offer.forEach((id, i) => {
      const y = startY + i * (ch + gap);
      const syn = synergyFor(w.cards, id);
      const card = el('div', 'ok-card', faces!);
      card.style.top = `${y - ch / 2}px`;
      card.style.height = `${ch}px`;
      card.style.background = `#${(syn ? PALETTE.focus : PALETTE.cardEdge).toString(16).padStart(6, '0')}`;
      el('div', 'ok-card-in', card);
      const r = Math.min(70, ch / 2 - 14);
      const dot = el('div', 'ok-card-dot', card);
      dot.style.cssText = `left:${96 - r}px;top:${ch / 2 - r}px;width:${r * 2}px;height:${r * 2}px`;
      // the icon lives in its own canvas so it can sway, squash on press and spin on pick
      const icon = el('canvas', 'ok-card-icon', card);
      // inline size: index.html's '#stage canvas' rule would otherwise stretch it
      icon.style.cssText = `left:${96 - 75}px;top:${ch / 2 - 75}px;width:150px;height:150px`;
      drawIcon(icon, id, ch < 180);
      icon.animate([{ transform: 'translateY(3px) rotate(-7deg)' }, { transform: 'translateY(-3px) rotate(7deg)' }], { duration: 900 + i * 130, delay: i * 160, direction: 'alternate', iterations: Infinity, easing: EASE.sine, fill: 'backwards' });
      // name and description stacked as one block, centred in the card and shrunk to fit it
      const text = el('div', 'ok-card-text', card);
      const name = el('div', 'ok-card-name', text);
      name.textContent = t(`card.${id}.name`);
      const desc = el('div', 'ok-card-desc', text);
      desc.textContent = t(`card.${id}.desc`);
      if (syn) {
        const s = el('div', 'ok-card-syn', desc);
        s.textContent = t('cards.synergy', { s: t(`syn.${syn}`) });
      }
      const fit = Math.min(1, (ch - 34) / Math.max(1, text.offsetHeight), 410 / Math.max(1, name.scrollWidth));
      text.style.transform = `translateY(-50%) scale(${fit.toFixed(3)})`;
      const held = countCards(w.cards, id);
      if (held > 0) el('div', 'ok-card-stack', card).textContent = t('cards.stack', { n: held + 1 });
      // slam in
      const slam = card.animate(
        [
          { transform: `translateY(-80px) scale(1.7) rotate(${i % 2 ? 7 : -7}deg)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { delay: 90 + i * 120, duration: 230, easing: EASE.cubicIn, fill: 'backwards' },
      );
      slam.onfinish = () => {
        if (mine !== gen || picking) return;
        ui.audio.playPreset(SFX.slam, { pitch: i * 2 });
        ui.stage.shake(0.18);
        card.animate([{ transform: 'scale(1.12, 0.88)' }, { transform: 'scale(1)' }], { duration: 220, easing: EASE.backOut });
      };
      pressable(
        card,
        () => !picking,
        () => {
          ui.unlock();
          icon.animate([{ transform: 'scale(0.78, 0.9)' }, { transform: 'scale(1.15)' }], { duration: 160, easing: EASE.backOut });
        },
        () => pick(i),
      );
      cards.push(card);
    });
    const by = Math.min(1200, startY + n * (ch + gap) + 40);
    // GameScene.buildCardFaces: reroll on the left, the rewarded +1 card (▶ AD) on the right
    const reroll: ButtonHandle = button(
      faces,
      CX - 165,
      by,
      t('cards.reroll', { n: w.rerollsLeft }),
      () => ui.unlock(),
      () => {
        if (picking || ui.game.w.rerollsLeft <= 0) return;
        ui.audio.play('pop');
        ui.game.reroll();
      },
      { width: 300, height: 100, fontSize: 38, variant: 'secondary' },
    );
    reroll.setEnabled(w.rerollsLeft > 0);
    reroll.el.dataset.testid = 'cards-reroll';
    extraBtn = button(faces, CX + 165, by, t('cards.extra'), () => ui.unlock(), () => void extra(), { width: 300, height: 100, fontSize: 38, ad: t('core.ad') });
    extraBtn.setEnabled(!w.offerExtra && !adPending);
    extraBtn.el.dataset.testid = 'cards-extra';
  }

  return {
    get open() {
      return root !== null;
    },
    sync(w, treasure) {
      if (w.phase !== 'cards') {
        // picked from elsewhere (the bot, a restart): never leave the overlay up
        if (root) close();
        return;
      }
      const k = `${w.offer.join(',')}|${w.rerollsLeft}`;
      if (!root) {
        onOpen();
        root = el('div', 'ok-group', parent);
        const scrim = el('div', 'ok-scrim', root);
        scrim.dataset.ui = '1';
        scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
        title = new Label(root, CX, 170, ui.t(treasure ? 'cards.treasure' : 'cards.title'), { size: 64, color: treasure ? PALETTE.gold : PALETTE.cream, stroke: 14 });
        title.el.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 300, easing: EASE.backOut });
        key = '';
      }
      if (k !== key && !picking) {
        key = k;
        build(w);
      }
    },
    close,
  };
}

// ---------------------------------------------------------------------------- result

/** The rewarded offers on a result (ResultScene: revive once per run, double coins once per result). */
export interface ResultAds {
  /** the run can be continued */
  revive: boolean;
  /** coins a "double coins" ad adds (0 = no button) */
  double: number;
}

export interface ResultScreen {
  readonly shown: boolean;
  show(r: RunResult, ads: ResultAds): void;
  update(real: number): void;
  hide(): void;
}

/**
 * The result's buttons (ResultScene): replay, upgrades, the forge, home (the title), the rank (the
 * ranks screen); and the rewards after a watched ad: revive (continue the run; the result closes)
 * and double (bank the coins once more; returns the coins added).
 */
export interface ResultHooks {
  replay: () => void;
  revive: () => void;
  double: (amount: number) => number;
  shop: () => void;
  forge: () => void;
  home: () => void;
  ranks: () => void;
}

export function createResult(ui: Ui, parent: HTMLElement, hooks: ResultHooks): ResultScreen {
  let root: HTMLElement | null = null;
  let scoreEl: HTMLElement | null = null;
  let badge: HTMLElement | null = null;
  let rankBadge: Sketch | null = null;
  let labels: Label[] = [];
  let rank = 0;
  let clock = 0;
  let score = 0;
  let age = 0;
  let dur = 0;
  let done = true;
  /** bumped on every show and hide: an ad answer for an earlier result grants nothing */
  let shows = 0;
  /** a rewarded ad is showing: every button waits */
  let busy = false;
  let btns: ButtonHandle[] = [];

  function setButtons(on: boolean): void {
    for (const b of btns) b.setEnabled(on);
  }

  /** ResultScene.rewarded: every button disabled while the ad shows; true only if this result is still up. */
  async function rewarded(placement: string): Promise<boolean> {
    if (busy || !root) return false;
    busy = true;
    setButtons(false);
    const token = shows;
    const ok = await ui.rewarded(placement);
    if (token !== shows) return false;
    busy = false;
    setButtons(true);
    return ok;
  }

  function hide(): void {
    shows += 1;
    busy = false;
    btns = [];
    for (const l of labels) l.destroy();
    labels = [];
    root?.remove();
    root = null;
    scoreEl = null;
    badge = null;
    rankBadge = null;
    done = true;
  }

  return {
    get shown() {
      return root !== null;
    },
    show(r, ads) {
      hide();
      const t = ui.t;
      const newBest = r.newBest;
      root = el('div', 'ok-group', parent);
      const scrim = el('div', 'ok-scrim', root);
      scrim.dataset.ui = '1';
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
      // the core's score card: 580 × 560 at (cx, 430)
      const panel = el('div', 'ok-panel', root);
      panel.style.cssText = 'left:70px;top:150px;width:580px;height:560px';
      const inner = el('div', '', panel);
      inner.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;width:520px';
      if (newBest) {
        badge = el('div', 'badge', inner);
        badge.textContent = t('core.newBest');
        badge.style.visibility = 'hidden';
      }
      el('div', 'cap', inner).textContent = t('core.score');
      scoreEl = el('div', 'score', inner);
      scoreEl.textContent = '0';
      el('div', 'best', inner).textContent = t('core.best', { n: r.best });
      const where = r.chapter >= CHAPTERS ? t(`chapter.${CHAPTERS}`) : t('result.chapter', { c: t(`chapter.${r.chapter}`), s: r.stage });
      // ResultScene's lines: the daily, where, coins, knockouts, the daily goal, records, new achievements
      const coinLine = r.daily ? 2 : 1;
      const lines = [...(r.daily ? [t('result.daily', { d: r.dailyKey })] : []), where, t('result.coins', { n: r.coins }), t('result.kos', { k: r.kos, h: r.headshots })];
      if (r.dailyCoins > 0) lines.push(t('result.dailyDone', { n: r.dailyStreak, c: r.dailyCoins }));
      // the run's bests, with the records screen's own captions
      if (r.streakBest > 1) lines.push(`${t('rec.streak')} ${r.streakBest}`);
      if (r.chainBest > 1) lines.push(`${t('rec.chain')} ${r.chainBest}`);
      if (r.records.length > 0) lines.push(t('result.records'));
      for (const id of r.feats.slice(0, 2)) lines.push(`★ ${t(`feat.${id}.name`)}`);
      let coinsEl: HTMLElement | null = null;
      lines.forEach((line, i) => {
        const l = el('div', 'line', inner);
        l.textContent = line;
        if (i === coinLine) coinsEl = l;
        // the card's lines slide in one by one after the panel lands
        l.animate([{ transform: 'translateX(-26px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 220 + i * 70, duration: 240, easing: EASE.cubicOut, fill: 'backwards' });
      });
      const fit = Math.min(1, (560 - 52) / Math.max(1, inner.offsetHeight));
      if (fit < 1) {
        inner.style.transform = `scale(${fit.toFixed(3)})`;
        inner.style.margin = `${(-inner.offsetHeight * (1 - fit)) / 2}px 0`;
      }
      panel.animate([{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: EASE.backOut });
      score = r.wave;
      age = 0;
      dur = Math.min(0.9, 0.2 + score * 0.04);
      done = false;
      ui.audio.play(newBest ? 'win' : 'lose');
      const tap = (fn: () => void) => () => {
        if (busy) return;
        ui.audio.play('tap');
        fn();
      };
      // replay and upgrades as in ResultScene, the forge under them; then the rewarded row (▶ AD):
      // revive (once per run) and double coins (once per result), side by side when both are offered
      btns = [
        button(root, CX, 820, t('core.replay'), ui.unlock, tap(hooks.replay), { width: 440 }),
        button(root, CX, 932, t('result.shop'), ui.unlock, tap(hooks.shop), { width: 440, variant: 'secondary' }),
        button(root, CX, 1044, t('title.forge'), ui.unlock, tap(hooks.forge), { width: 440, height: 96, fontSize: 40, variant: 'secondary' }),
      ];
      const offers: { id: string; text: string; secondary: boolean; act: () => Promise<void> }[] = [];
      if (ads.revive) {
        offers.push({
          id: 'result-revive',
          text: t('result.revive'),
          secondary: false,
          act: async () => {
            if (await rewarded('revive')) hooks.revive();
          },
        });
      }
      if (ads.double > 0) {
        const amount = ads.double;
        offers.push({
          id: 'result-double',
          text: t('result.double'),
          secondary: true,
          act: async () => {
            if (!(await rewarded('double_coins'))) return;
            const added = hooks.double(amount);
            if (added <= 0) return;
            // the button gives way to the news, in its place
            const b = btns.find((x) => x.el.dataset.testid === 'result-double');
            const bw = b ? parseFloat(b.el.style.width) : 440;
            const bx = b ? parseFloat(b.el.style.left) + bw / 2 : CX;
            if (b) {
              b.el.remove();
              btns = btns.filter((x) => x !== b);
            }
            if (coinsEl) {
              coinsEl.textContent = t('result.coins', { n: r.coins + added });
              coinsEl.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 320, easing: EASE.backOut });
            }
            ui.audio.playPreset(SFX.loot);
            if (root) {
              const done = new Label(root, bx, 1156, t('result.doubled'), { size: bw < 400 ? 32 : 40, color: PALETTE.coin, stroke: 10, wrap: bw });
              labels.push(done);
              done.el.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300, easing: EASE.backOut });
            }
          },
        });
      }
      const ow = offers.length > 1 ? 300 : 440;
      offers.forEach((o, i) => {
        const x = offers.length > 1 ? CX + (i === 0 ? -165 : 165) : CX;
        const b = button(root!, x, 1156, o.text, ui.unlock, () => {
          if (busy) return;
          ui.audio.play('tap');
          void o.act();
        }, { width: ow, height: 96, fontSize: 40, variant: o.secondary ? 'secondary' : 'primary', ad: t('core.ad') });
        b.el.dataset.testid = o.id;
        btns.push(b);
      });
      btns.forEach((b, i) => b.el.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 200 + i * 60, duration: 260, easing: EASE.backOut, fill: 'backwards' }));
      // home (top left) and the rank (top right: badge, name, bow; a tap opens the ranks)
      roundButton(root, 70, 70, 96, 'home', ui.unlock, tap(hooks.home));
      const save = ui.game.save.data;
      rank = rankOf(progressScore(save).total);
      rankBadge = new Sketch(root, 600 - 60, 78 - 60, 120, 120);
      labels.push(new Label(root, 600, 134, t(`rank.${RANKS[rank]!.id}`), { size: 28, color: PALETTE.gold, stroke: 8 }));
      labels.push(new Label(root, 600, 166, t('bow.name', { name: t(`bow.${bowTier(save.bow.level)}`), n: save.bow.level }), { size: 22, color: PALETTE.cream, stroke: 6 }));
      const zone = el('div', '', root);
      zone.style.cssText = 'position:absolute;left:510px;top:9px;width:180px;height:150px;pointer-events:auto;cursor:pointer';
      pressable(zone, () => true, ui.unlock, tap(hooks.ranks));
    },
    update(real) {
      clock += real;
      if (rankBadge) drawBadge(rankBadge.begin().phaser, 600, 78, 34, rank, clock);
      if (done || !scoreEl) return;
      age += real;
      const u = Math.min(1, age / dur);
      const shown = String(Math.round(score * (1 - (1 - u) ** 3)));
      if (scoreEl.textContent !== shown) scoreEl.textContent = shown;
      if (u < 1) return;
      done = true;
      scoreEl.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 220, easing: EASE.backOut });
      if (badge) {
        badge.style.visibility = 'visible';
        badge.animate([{ transform: 'scale(0.3)' }, { transform: 'scale(1)' }], { duration: 320, easing: EASE.backOut });
      }
    },
    hide,
  };
}

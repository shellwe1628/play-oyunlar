/**
 * The overlays (the main menu is ./title.ts): card pick (GameScene.openCards / buildCardFaces /
 * onPickCard / onExtra) and the result card (core ResultScene shell + games/okcu ResultScene
 * lines, revive and double coins). Same positions, sizes, colours and timings as the 2D game, in
 * its logical px. The rewarded buttons (▶ AD) go through `Ui.rewarded` (the platform adapter).
 */
import type { Audio } from '@oyun/core/pure';
import { drawBadge } from '@okcu/scenes/gear';
import { drawCardIcon } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { bowTier } from '@sim/bow';
import { countCards, synergyFor, type CardId, type SynergyId } from '@sim/cards';
import { CHAPTERS } from '@sim/chapters';
import { progressScore, RANKS, rankOf } from '@sim/progress';
import type { World } from '@sim/world';
import type { Game, Stage } from '../contract';
import { button, EASE, el, Label, pressable, roundButton, Sketch, type ButtonHandle } from './dom';
import { Gfx } from './gfx';
import type { RunResult } from './progress';

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
  /**
   * The part of the logical 720 × 1280 frame really on screen, inside the safe areas: tall phones
   * show more than 1280 (top < 0, bottom > 1280), a notch or a home bar shows less.
   */
  view?: () => { top: number; bottom: number };
}

const CX = 360;

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

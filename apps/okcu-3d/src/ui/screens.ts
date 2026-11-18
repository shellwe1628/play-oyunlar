/**
 * The overlays: title (GameScene.buildTitle), card pick (GameScene.openCards / buildCardFaces /
 * onPickCard) and the result card (core ResultScene shell + games/okcu ResultScene lines).
 * Same positions, sizes, colours and timings as the 2D game, in its logical px.
 */
import type { Audio } from '@oyun/core/pure';
import { drawCardIcon } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { bowTier } from '@sim/bow';
import { countCards, synergyFor, type CardId, type SynergyId } from '@sim/cards';
import { CHAPTERS, stageOf } from '@sim/chapters';
import type { World } from '@sim/world';
import type { Game, Stage } from '../contract';
import { button, EASE, el, Label, pressable, type ButtonHandle } from './dom';
import { Gfx } from './gfx';

export type T = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface Ui {
  stage: Stage;
  game: Game;
  layer: HTMLElement;
  t: T;
  audio: Audio;
  /** create/resume the audio context (must run inside a pointer gesture) */
  unlock(): void;
}

const CX = 360;

// ---------------------------------------------------------------------------- title

export interface TitleScreen {
  readonly shown: boolean;
  show(w: World, quick: boolean, best: number): void;
  hide(): void;
  /** a tap instead of a drag: the hint jumps */
  nudge(): void;
  clear(): void;
}

export function createTitle(ui: Ui, parent: HTMLElement): TitleScreen {
  let root: HTMLElement | null = null;
  let hint: Label | null = null;
  let labels: Label[] = [];
  let boing = 0;
  let pulse: Animation | null = null;

  function drop(): void {
    window.clearInterval(boing);
    for (const l of labels) l.destroy();
    labels = [];
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
    show(w, quick, best) {
      drop();
      const t = ui.t;
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
      // the bow, the player's standing at a glance (the rank beside it needs the save: left out)
      const level = ui.game.bowLevel;
      labels.push(new Label(root, CX, subY, t('bow.name', { name: t(`bow.${bowTier(level)}`), n: level }), { size: 34, color: PALETTE.gold, stroke: 10 }));
      if (best > 0) labels.push(new Label(root, CX, subY + 46, t('title.best', { n: best }), { size: 30, color: PALETTE.cream, stroke: 8 }));
      if (w.startChapter > 0) labels.push(new Label(root, CX, subY + 84, t('title.hand', { n: w.cards.length }), { size: 28, color: PALETTE.cream, stroke: 8 }));
      // the hint, kept above the highest spot the first archer can stand (its head is never above y ≈ 520)
      const hintY = Math.min(subY + (w.startChapter > 0 ? 136 : 100), 500);
      hint = new Label(root, CX, hintY, t('title.drag'), { size: 50, color: PALETTE.white, wrap: 640, stroke: 14 });
      labels.push(hint);
      startPulse();
    },
    hide() {
      const r = root;
      if (!r) return;
      window.clearInterval(boing);
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

  function close(): void {
    gen += 1;
    title?.destroy();
    title = null;
    root?.remove();
    root = null;
    faces = null;
    cards = [];
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
    // the 2D game's second button here (+1 card) is a rewarded ad: left out, so the reroll is centred
    const reroll: ButtonHandle = button(
      faces,
      CX,
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

export interface ResultScreen {
  readonly shown: boolean;
  show(w: World, best: number, newBest: boolean): void;
  update(real: number): void;
  hide(): void;
}

export function createResult(ui: Ui, parent: HTMLElement): ResultScreen {
  let root: HTMLElement | null = null;
  let scoreEl: HTMLElement | null = null;
  let badge: HTMLElement | null = null;
  let score = 0;
  let age = 0;
  let dur = 0;
  let done = true;

  function hide(): void {
    root?.remove();
    root = null;
    scoreEl = null;
    badge = null;
    done = true;
  }

  return {
    get shown() {
      return root !== null;
    },
    show(w, best, newBest) {
      hide();
      const t = ui.t;
      const r = w.run;
      const p = stageOf(w.wave);
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
      el('div', 'best', inner).textContent = t('core.best', { n: best });
      const where = p.chapter >= CHAPTERS ? t(`chapter.${CHAPTERS}`) : t('result.chapter', { c: t(`chapter.${p.chapter}`), s: p.stage });
      const lines = [where, t('result.coins', { n: r.coins }), t('result.kos', { k: r.kos, h: r.headshots })];
      // the run's bests, with the records screen's own captions
      if (r.streakBest > 1) lines.push(`${t('rec.streak')} ${r.streakBest}`);
      if (r.chainBest > 1) lines.push(`${t('rec.chain')} ${r.chainBest}`);
      for (const line of lines) el('div', 'line', inner).textContent = line;
      const fit = Math.min(1, (560 - 52) / Math.max(1, inner.offsetHeight));
      if (fit < 1) {
        inner.style.transform = `scale(${fit.toFixed(3)})`;
        inner.style.margin = `${(-inner.offsetHeight * (1 - fit)) / 2}px 0`;
      }
      panel.animate([{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: EASE.backOut });
      score = w.wave;
      age = 0;
      dur = Math.min(0.9, 0.2 + score * 0.04);
      done = false;
      ui.audio.play(newBest ? 'win' : 'lose');
      const replay = button(
        root,
        CX,
        820,
        t('core.replay'),
        () => ui.unlock(),
        () => {
          ui.audio.play('tap');
          ui.game.restart();
        },
        { width: 440 },
      );
      replay.el.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 200, duration: 260, easing: EASE.backOut, fill: 'backwards' });
    },
    update(real) {
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

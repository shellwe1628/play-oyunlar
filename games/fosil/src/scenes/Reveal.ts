import { cssColor, label, type OyunScene } from '@oyun/core';
import Phaser from 'phaser';
import { SFX } from '../sfx';
import { LAYERS, TIERS, at } from '../sim/data';
import type { Find } from '../sim/dig';
import { fossilKey, PALETTE } from '../textures';
import { cardBack, fitText, fossilName, luckLine, oddsText, outlined, rarityCard } from './ui';

/** Odds at which the ceremony escalates (GAME.md "Feel"). */
export const CARD_AT = 100;
export const GRAND_AT = 10_000;

export type RevealKind = 'pop' | 'card' | 'grand';

export function revealKind(odds: number): RevealKind {
  return odds >= GRAND_AT ? 'grand' : odds >= CARD_AT ? 'card' : 'pop';
}

interface Host {
  scene: OyunScene;
  /** Where finds come out of (block centre). */
  origin(): { x: number; y: number };
  /** Where a finished reveal flies to (the last-find strip). */
  slot(): { x: number; y: number };
  /** Called when a reveal lands, to refresh the last-find strip etc. */
  landed(find: Find): void;
  /** Slow-motion factor for the sim while a grand reveal builds up (1 = normal). */
  setSlowMo(f: number): void;
}

const MAX_POPS = 6;
const CARD_W = 320;
const CARD_H = 400;
/** Badge centre below the card top: under the 64 px tier band, beside the art. */
const BADGE_Y = 112;

/**
 * Plays the reveal for every find, scaled by rarity:
 * - common (< 1 in 100): quick pop out of the block with its odds and a tick.
 * - 1 in 100+: the card flips over, sparkles, rising chime, medium haptic. Digging continues.
 * - 1 in 10,000+: everything stops: slow-motion build-up, shake, colour flash, the odds number
 *   slams in, long chime, strong haptic. Waits for a tap.
 */
export class Reveal {
  private pops = 0;
  private side = 1;
  private cardQueue: { find: Find; from?: { x: number; y: number } }[] = [];
  private cardBusy = false;
  private grandQueue: { find: Find; from?: { x: number; y: number } }[] = [];
  private grand: { overlay: Phaser.GameObjects.Rectangle; objects: Phaser.GameObjects.GameObject[]; canDismiss: boolean; find: Find } | null = null;
  /** Kind of the last reveal started (test state). */
  lastKind: RevealKind | null = null;

  constructor(private readonly host: Host) {}

  get blocking(): boolean {
    return this.grand !== null;
  }

  get canDismiss(): boolean {
    return this.grand?.canDismiss ?? false;
  }

  get busy(): string | null {
    return this.grand ? 'grand' : this.cardBusy ? 'card' : null;
  }

  show(find: Find, from?: { x: number; y: number }): void {
    const kind = revealKind(find.fossil.odds);
    this.lastKind = kind;
    if (kind === 'grand') {
      this.grandQueue.push({ find, from });
      if (!this.grand) this.nextGrand();
    } else if (kind === 'card') {
      if (this.cardQueue.length >= 3) {
        this.pop(find, from);
        return;
      }
      this.cardQueue.push({ find, from });
      if (!this.cardBusy && !this.grand) this.nextCard();
    } else this.pop(find, from);
  }

  /** Tap on the grand overlay. Returns true when it closed. */
  dismiss(): boolean {
    const g = this.grand;
    if (!g || !g.canDismiss) return false;
    const s = this.host.scene;
    const slot = this.host.slot();
    this.grand = null;
    const card = g.objects.find((o) => o.getData('card') === true) as Phaser.GameObjects.Container | undefined;
    for (const o of g.objects) {
      if (o === card) continue;
      // stop the endless spin / blink tweens before the objects go away (no leak per find)
      s.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) for (const c of o.list) s.tweens.killTweensOf(c);
      s.tweens.add({ targets: o, alpha: 0, duration: 220, onComplete: () => o.destroy() });
    }
    s.tweens.add({ targets: g.overlay, alpha: 0, duration: 260, onComplete: () => g.overlay.destroy() });
    if (card) {
      s.tweens.add({
        targets: card,
        x: slot.x,
        y: slot.y,
        scale: 0.15,
        alpha: 0.2,
        duration: 380,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          card.destroy();
          this.host.landed(g.find);
        },
      });
    } else this.host.landed(g.find);
    if (this.grandQueue.length) s.time.delayedCall(300, () => this.nextGrand());
    else if (this.cardQueue.length) s.time.delayedCall(300, () => {
      if (!this.cardBusy && !this.grand) this.nextCard();
    });
    return true;
  }

  // ------------------------------------------------------------------ common

  private pop(find: Find, from?: { x: number; y: number }): void {
    const s = this.host.scene;
    const o = from ?? this.host.origin();
    s.oyun.audio.playPreset(SFX.tick, { pitch: find.fossil.tier * 3 + (find.isNew ? 4 : 0), volume: find.source === 'assistant' ? 0.5 : 1 });
    if (this.pops >= MAX_POPS) {
      this.host.landed(find);
      return;
    }
    this.pops++;
    const slot = this.host.slot();
    const img = s.add.image(o.x, o.y, fossilKey(find.fossil.id)).setDepth(600).setScale(0.15);
    const tierColor = at(TIERS, find.fossil.tier).color;
    const ring = s.add.circle(o.x, o.y, 58, tierColor, 0.35).setDepth(599).setScale(0.2);
    const odds = outlined(s, o.x, o.y + 70, oddsText(s, find.fossil.odds), 34, find.fossil.tier === 0 ? 0xffffff : tierColor, 7).setDepth(601).setAlpha(0);
    const luck = outlined(s, o.x, o.y + 110, luckLine(s, find.source, find.luck), 24, find.source === 'assistant' ? PALETTE.sand : PALETTE.luck, 5).setDepth(601).setAlpha(0);
    // alternate sides so back-to-back finds never print their odds on top of each other
    this.side = -this.side;
    const dx = this.side * (70 + Math.random() * 70);
    s.tweens.add({ targets: [img, ring], scale: 0.62, y: o.y - 120, x: o.x + dx, duration: 230, ease: 'Back.easeOut' });
    s.tweens.add({ targets: odds, alpha: 1, y: o.y - 30, x: o.x + dx, duration: 230, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: luck, alpha: 1, y: o.y + 2, x: o.x + dx, duration: 230, ease: 'Cubic.easeOut' });
    if (find.isNew) {
      const tag = outlined(s, o.x + dx, o.y - 200, s.t('reveal.new'), 34, PALETTE.ochreLight, 7).setDepth(602);
      s.juice.pop(tag, 0.4, 260);
      s.tweens.add({ targets: tag, alpha: 0, delay: 600, duration: 250, onComplete: () => tag.destroy() });
    }
    s.tweens.add({
      targets: [img, ring],
      x: slot.x,
      y: slot.y,
      scale: 0.25,
      alpha: 0.4,
      delay: find.isNew ? 520 : 330,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        img.destroy();
        ring.destroy();
        this.pops--;
        this.host.landed(find);
      },
    });
    s.tweens.add({ targets: [odds, luck], alpha: 0, delay: find.isNew ? 520 : 330, duration: 200, onComplete: () => {
      odds.destroy();
      luck.destroy();
    } });
  }

  // ------------------------------------------------------------------ 1 in 100+

  private nextCard(): void {
    const next = this.cardQueue.shift();
    if (!next) {
      this.cardBusy = false;
      return;
    }
    this.cardBusy = true;
    const { find } = next;
    const s = this.host.scene;
    const o = next.from ?? this.host.origin();
    const L = s.layout;
    const pos = { x: L.cx, y: Math.max(L.top + 270 + CARD_H / 2 + 10, o.y) };
    const tierColor = at(TIERS, find.fossil.tier).color;
    const big = find.fossil.odds >= 1000;

    const rays = s.add.container(pos.x, pos.y).setDepth(700).setAlpha(0);
    // short rays: they stay inside the dig site, clear of the HUD and the combo bar
    for (let i = 0; i < 10; i++) rays.add(s.add.image(0, 0, 'ray').setOrigin(0.5, 0).setAngle(i * 36).setTint(tierColor).setAlpha(0.7).setScale(1, 0.62));
    const back = cardBack(s, CARD_W, CARD_H, at(at(LAYERS, find.fossil.layer).bands, 1)).setDepth(710).setPosition(o.x, o.y).setScale(0.2);
    const front = rarityCard(s, find.fossil, CARD_W, CARD_H).setDepth(710).setPosition(pos.x, pos.y).setVisible(false);

    s.oyun.audio.playPreset(SFX.flip);
    s.tweens.add({ targets: back, x: pos.x, y: pos.y, scale: 1, duration: 260, ease: 'Back.easeOut' });
    s.tweens.add({ targets: back, scaleX: 0, delay: 300, duration: 110, ease: 'Quad.easeIn' });
    s.time.delayedCall(410, () => {
      back.destroy();
      // the front pops in whole (never squashed mid-flip, so the odds are never half drawn)
      front.setVisible(true).setScale(0.7);
      s.tweens.add({ targets: front, scale: 1, duration: 170, ease: 'Back.easeOut' });
      const cap = outlined(s, pos.x, pos.y - CARD_H / 2 - 22, luckLine(s, find.source, find.luck), 26, find.source === 'assistant' ? PALETTE.sand : PALETTE.luck, 6).setDepth(720);
      s.tweens.add({ targets: cap, alpha: 0, delay: hold, duration: 200, onComplete: () => cap.destroy() });
      s.tweens.add({ targets: rays, alpha: 0.55, duration: 200 });
      s.tweens.add({ targets: rays, angle: 90, duration: 3000 });
      s.oyun.audio.playPreset(SFX.chime, { pitch: Math.min(6, find.fossil.tier * 2 - 4) });
      s.juice.feedback('medium', pos.x, pos.y, tierColor);
      s.juice.burst(pos.x, pos.y, { count: big ? 22 : 14, color: tierColor, texture: 'spark', distance: 260 });
      s.juice.burst(pos.x, pos.y, { count: 8, color: 0xffffff, texture: 'spark', distance: 200 });
      // stickers on the card's side edges, below the tier band: they never touch the tier name
      if (find.isNew) this.badge(pos.x + CARD_W / 2, pos.y - CARD_H / 2 + BADGE_Y, s.t('reveal.new'));
      if (find.fusions > 0) this.badge(pos.x - CARD_W / 2, pos.y - CARD_H / 2 + BADGE_Y, s.t(`grade.${find.grade}`));
      if (find.source === 'glint') this.badge(pos.x - CARD_W / 2 + 70, pos.y + CARD_H / 2 - 14, s.t('reveal.glint'));
      if (find.source === 'assistant') this.badge(pos.x - CARD_W / 2 + 80, pos.y + CARD_H / 2 - 14, s.t('reveal.assistantFind'));
    });
    const hold = big ? 1900 : 1450;
    s.time.delayedCall(410 + hold, () => {
      const slot = this.host.slot();
      s.tweens.add({ targets: rays, alpha: 0, duration: 200, onComplete: () => rays.destroy() });
      s.tweens.add({
        targets: front,
        x: slot.x,
        y: slot.y,
        scale: 0.14,
        alpha: 0.3,
        duration: 300,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          front.destroy();
          this.host.landed(find);
          if (this.grandQueue.length && !this.grand) this.nextGrand();
          else this.nextCard();
        },
      });
    });
  }

  private badge(x: number, y: number, text: string): void {
    const s = this.host.scene;
    const t = outlined(s, x, y, text, 34, PALETTE.ochreLight, 7).setDepth(720).setAngle(-8);
    s.juice.pop(t, 0.3, 300);
    s.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 300, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------------ 1 in 10,000+

  private nextGrand(): void {
    const next = this.grandQueue.shift();
    if (!next) return;
    const { find } = next;
    const s = this.host.scene;
    const L = s.layout;
    const o = next.from ?? this.host.origin();
    const tier = at(TIERS, find.fossil.tier);
    const cam = s.cameras.main;
    const reduced = s.oyun.reducedMotion;
    const objects: Phaser.GameObjects.GameObject[] = [];

    const overlay = s.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, 0x000000, 0).setDepth(800).setInteractive();
    overlay.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.dismiss());
    this.grand = { overlay, objects, canDismiss: false, find };
    s.oyun.platform.haptic('medium');

    // 1. Slow motion: the world slows, the screen darkens, a swell rises, debris hangs in the air.
    this.host.setSlowMo(0.15);
    s.oyun.audio.playPreset(SFX.longChime);
    s.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 700, ease: 'Sine.easeOut' });
    if (!reduced) s.tweens.add({ targets: cam, zoom: 1.12, duration: 900, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 18; i++) {
      const chip = s.add.image(o.x, o.y, 'chip').setDepth(805).setTint(at(at(LAYERS, find.fossil.layer).bands, i % 5)).setScale(1 + Math.random() * 1.5);
      objects.push(chip);
      const a = Math.random() * Math.PI * 2;
      const d = 120 + Math.random() * 220;
      s.tweens.add({ targets: chip, x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, angle: Math.random() * 360, alpha: 0, duration: 2600, ease: 'Expo.easeOut' });
    }
    const pos = { x: L.cx, y: L.top + 520 };
    const rays = s.add.container(pos.x, pos.y).setDepth(810).setAlpha(0);
    for (let i = 0; i < 14; i++) rays.add(s.add.image(0, 0, 'ray').setOrigin(0.5, 0).setAngle(i * (360 / 14)).setTint(tier.color).setScale(1.2, 0.95));
    objects.push(rays);
    s.tweens.add({ targets: rays, alpha: 0.9, duration: 900 });
    s.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
    const back = cardBack(s, CARD_W, CARD_H, at(at(LAYERS, find.fossil.layer).bands, 1)).setDepth(820).setPosition(o.x, o.y + 40).setScale(0.3).setAlpha(0.6);
    objects.push(back);
    s.tweens.add({ targets: back, x: pos.x, y: pos.y, scale: 1, alpha: 1, duration: 950, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: back, angle: { from: -3, to: 3 }, duration: 90, yoyo: true, repeat: 9, delay: 300 });

    const front = rarityCard(s, find.fossil, CARD_W, CARD_H).setDepth(820).setPosition(pos.x, pos.y).setVisible(false);
    front.setData('card', true);
    objects.push(front);
    const cardOdds = front.getData('odds') as Phaser.GameObjects.Text;
    cardOdds.setVisible(false);

    // 2. Flip at full speed: flash, shake, strong haptic.
    s.time.delayedCall(1000, () => {
      this.host.setSlowMo(1);
      if (!reduced) s.tweens.add({ targets: cam, zoom: 1, duration: 180, ease: 'Back.easeOut' });
      back.destroy();
      front.setVisible(true).setScale(0.2, 1.2);
      s.tweens.add({ targets: front, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
      const flash = s.add.rectangle(L.cx, L.height / 2, L.width + 40, L.height + 40, tier.color, reduced ? 0.35 : 0.9).setDepth(900);
      s.tweens.add({ targets: flash, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
      s.juice.shake(0.9);
      s.juice.hitStop(120);
      s.oyun.platform.haptic('heavy');
      s.juice.burst(pos.x, pos.y, { count: 32, color: tier.color, texture: 'spark', distance: 420, duration: 900 });
      s.juice.burst(pos.x, pos.y, { count: 16, color: 0xffffff, texture: 'spark', distance: 320, duration: 800 });
    });

    // 3. The odds number slams in.
    s.time.delayedCall(1450, () => {
      const oddsBig = label(s, pos.x, pos.y + CARD_H / 2 + 80, oddsText(s, find.fossil.odds), { size: 84, color: tier.color });
      oddsBig.setStroke(cssColor(PALETTE.shadow), 12).setDepth(860);
      fitText(oddsBig, L.width - 60);
      const rest = oddsBig.scaleX;
      oddsBig.setScale(rest * 3.2).setAlpha(0);
      objects.push(oddsBig);
      // chain on completion (not a timer): under a slow clock a timer can fire mid-tween and the
      // squash would yoyo back to an oversized scale
      s.tweens.add({
        targets: oddsBig,
        scale: rest,
        alpha: 1,
        duration: 200,
        ease: 'Quad.easeIn',
        onComplete: () => {
          oddsBig.setScale(rest);
          s.oyun.audio.playPreset(SFX.slam);
          s.juice.shake(0.6);
          s.oyun.platform.haptic('heavy');
          s.juice.burst(oddsBig.x, oddsBig.y, { count: 14, color: 0xffffff, texture: 'chip', distance: 220 });
          s.tweens.add({ targets: oddsBig, scaleY: rest * 0.85, scaleX: rest * 1.08, duration: 70, yoyo: true, onComplete: () => oddsBig.setScale(rest) });
        },
      });
      const title = outlined(s, pos.x, pos.y - CARD_H / 2 - 64, fossilName(s, find.fossil), 56, 0xffffff, 10).setDepth(860);
      fitText(title, L.width - 60);
      objects.push(title);
      s.juice.pop(title, 0.4, 360);
      const luckText = outlined(s, pos.x, pos.y + CARD_H / 2 + 156, luckLine(s, find.source, find.luck), 32, PALETTE.sand, 6).setDepth(860);
      fitText(luckText, L.width - 60);
      objects.push(luckText);
      if (find.isNew) {
        const tag = outlined(s, pos.x + CARD_W / 2, pos.y - CARD_H / 2 + BADGE_Y, s.t('reveal.new'), 40, PALETTE.ochreLight, 8).setDepth(905).setAngle(-10); // above sparks
        objects.push(tag);
        s.juice.pop(tag, 0.3, 320);
      }
    });

    // 4. Confetti rain and the prompt; only then can a tap close it.
    s.time.delayedCall(1800, () => {
      s.oyun.platform.haptic('success');
      for (let i = 0; i < 26; i++) {
        const star = s.add.image(Math.random() * L.width, L.top - 40 - Math.random() * 300, 'spark').setDepth(850).setTint(i % 3 ? tier.color : 0xffffff).setScale(0.8 + Math.random());
        objects.push(star);
        s.tweens.add({ targets: star, y: L.height + 60, angle: 360 * (Math.random() < 0.5 ? 1 : -1), duration: 2200 + Math.random() * 1800, ease: 'Sine.easeIn' });
      }
      const tap = outlined(s, L.cx, L.bottom - 70, s.t('reveal.tap'), 38, 0xffffff, 7).setDepth(870);
      objects.push(tap);
      s.tweens.add({ targets: tap, alpha: 0.35, yoyo: true, repeat: -1, duration: 600 });
      if (this.grand) this.grand.canDismiss = true;
    });
  }
}

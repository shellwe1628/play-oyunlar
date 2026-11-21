import { cssColor, label, touchHitSize, type OyunScene } from '@oyun/core';
import Phaser from 'phaser';
import { TIERS, type Fossil, at } from '../sim/data';
import type { FindSource } from '../sim/dig';
import { countKey, formatBig, formatOddsNumber, type Lang } from '../sim/format';
import { fossilKey, PALETTE } from '../textures';

export function lang(scene: OyunScene): Lang {
  return scene.oyun.lang === 'tr' ? 'tr' : 'en';
}

export function big(scene: OyunScene, n: number): string {
  return formatBig(n, lang(scene));
}

/** "1 in 250" / "250'de 1". */
export function oddsText(scene: OyunScene, odds: number): string {
  return scene.t('odds.line', { n: formatOddsNumber(odds, lang(scene)) });
}

export function fossilName(scene: OyunScene, f: Fossil): string {
  return scene.t(`fossil.${f.id}`);
}

export function tierName(scene: OyunScene, f: Fossil): string {
  return scene.t(`tier.${at(TIERS, f.tier).id}`);
}

/** Multiplier with up to 2 decimals, trailing zeros trimmed: ×2, ×1.25, ×12.5. */
export function mult(scene: OyunScene, x: number): string {
  const s = x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
  const trimmed = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  return lang(scene) === 'tr' ? trimmed.replace('.', ',') : trimmed;
}

/** Text with the game font and a dark outline, for text over busy art. */
export function outlined(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: number = 0xffffff, stroke = 8): Phaser.GameObjects.Text {
  const t = label(scene, x, y, text, { size, color });
  t.setStroke(cssColor(PALETTE.shadow), stroke);
  return t;
}

/** Shrink a text object until it fits maxWidth (never below minScale). */
export function fitText(t: Phaser.GameObjects.Text, maxWidth: number, minScale = 0.55): Phaser.GameObjects.Text {
  t.setScale(1);
  if (t.width > maxWidth) t.setScale(Math.max(minScale, maxWidth / t.width));
  return t;
}

/**
 * A rarity card: tier-coloured frame, cream face, fossil art, name, tier and the odds printed
 * large. Built as a container centred on (0, 0) so it can be flipped by scaling X.
 */
export function rarityCard(scene: OyunScene, f: Fossil, w: number, h: number): Phaser.GameObjects.Container {
  const tier = at(TIERS, f.tier);
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  if (f.tier >= 4) for (let i = 3; i > 0; i--) g.fillStyle(tier.color, 0.12 * i).fillRoundedRect(-w / 2 - i * 8, -h / 2 - i * 8, w + i * 16, h + i * 16, 34 + i * 6);
  g.fillStyle(PALETTE.shadow, 0.45).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, 30);
  g.fillStyle(tier.color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 30);
  g.fillStyle(PALETTE.cardFace, 1).fillRoundedRect(-w / 2 + 12, -h / 2 + 64, w - 24, h - 76, 22);
  g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 14, -h / 2 + 8, w - 28, 22, 11);
  c.add(g);
  const tierT = label(scene, 0, -h / 2 + 34, tierName(scene, f), { size: 32, color: 0xffffff });
  tierT.setStroke(cssColor(PALETTE.shadow), 6);
  c.add(fitText(tierT, w - 40));
  const art = scene.add.image(0, -h / 2 + 64 + (h - 76) * 0.36, fossilKey(f.id));
  art.setScale(Math.min(1.4, (w - 60) / 160, ((h - 76) * 0.55) / 160));
  c.add(art);
  const name = label(scene, 0, h / 2 - 132, fossilName(scene, f), { size: 40, color: PALETTE.ink });
  c.add(fitText(name, w - 50));
  const odds = label(scene, 0, h / 2 - 66, oddsText(scene, f.odds), { size: 56, color: tier.color === 0x9a8f80 ? PALETTE.ink : tier.color });
  odds.setStroke(cssColor(PALETTE.ink), f.tier >= 2 ? 4 : 0);
  c.add(fitText(odds, w - 40));
  c.setData('odds', odds);
  c.setData('art', art);
  return c;
}

/** Back of a card (before the flip): stratum colours and a question mark. */
export function cardBack(scene: OyunScene, w: number, h: number, color: number): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.shadow, 0.45).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, 30);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 30);
  g.lineStyle(6, 0xffffff, 0.35).strokeRoundedRect(-w / 2 + 16, -h / 2 + 16, w - 32, h - 32, 22);
  c.add(g);
  c.add(outlined(scene, 0, 0, '?', 140, 0xffffff, 10));
  return c;
}

/** An invisible interactive rectangle with a hit area of at least 88×88 (centred origin). */
export function hitZone(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onDown: () => void): Phaser.GameObjects.Zone {
  const size = touchHitSize(w, h);
  const z = scene.add.zone(x, y, size.width, size.height).setInteractive({ useHandCursor: true });
  z.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onDown);
  return z;
}

/** Text that says which luck a find was rolled at, and by whom. */
export function luckLine(scene: OyunScene, source: FindSource, luck: number): string {
  const n = mult(scene, luck);
  if (source === 'assistant') return scene.t('reveal.assistant', { n });
  if (source === 'offline') return scene.t('reveal.offline', { n });
  if (source === 'glint') return scene.t('reveal.glintLuck', { n });
  return scene.t('reveal.luckShort', { n });
}


/** "1 tap" / "3 taps" (Turkish has one form): a counted noun with its number. */
export function counted(scene: OyunScene, base: string, n: number): string {
  return scene.t(countKey(base, n), { n: big(scene, n) });
}

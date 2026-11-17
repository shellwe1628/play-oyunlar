/**
 * Damage numbers and hit words that stay readable when many arrows land at once: hits on the
 * same archer within a short window add up into one number (it pops as it grows), and a word
 * ("HEADSHOT!", "KO!") shows at most once per archer per window, above the number.
 * Pooled Text objects: no allocation during play.
 */
import { cssColor } from '@oyun/core';
import type Phaser from 'phaser';
import { PALETTE } from '../textures';

interface Slot {
  text: Phaser.GameObjects.Text;
  id: number;
  kind: 'num' | 'word';
  total: number;
  age: number;
  life: number;
  x: number;
  y: number;
  active: boolean;
}

const MERGE = 0.7;
const POOL = 12;

export class HitNumbers {
  private readonly slots: Slot[] = [];

  constructor(scene: Phaser.Scene, fontFamily: string) {
    for (let i = 0; i < POOL; i++) {
      const text = scene.add
        .text(0, 0, '', { fontFamily, fontSize: '44px', fontStyle: '800', color: cssColor(PALETTE.white), stroke: cssColor(PALETTE.ink), strokeThickness: 9 })
        .setOrigin(0.5)
        .setDepth(1000)
        .setVisible(false);
      this.slots.push({ text, id: -1, kind: 'num', total: 0, age: 0, life: 0, x: 0, y: 0, active: false });
    }
  }

  private find(id: number, kind: Slot['kind']): Slot | undefined {
    return this.slots.find((s) => s.active && s.id === id && s.kind === kind && s.age < MERGE);
  }

  private take(): Slot {
    let pick = this.slots[0]!;
    for (const s of this.slots) {
      if (!s.active) return s;
      if (s.age > pick.age) pick = s;
    }
    return pick;
  }

  private pop(s: Slot, scale: number): void {
    s.text.setScale(scale);
  }

  /** Add damage to archer `id`'s running number at screen (x, y). */
  damage(id: number, x: number, y: number, dmg: number, color: number, big: boolean): void {
    const prev = this.find(id, 'num');
    if (prev) {
      prev.total += dmg;
      prev.age = 0;
      prev.life = 0.95;
      prev.text.setText(String(Math.round(prev.total))).setColor(cssColor(color));
      this.pop(prev, big ? 1.5 : 1.3);
      return;
    }
    const s = this.take();
    Object.assign(s, { id, kind: 'num', total: dmg, age: 0, life: 0.95, x: x + 34, y: y - 40, active: true });
    s.text.setText(String(Math.round(dmg))).setFontSize(big ? 54 : 44).setColor(cssColor(color)).setVisible(true).setAlpha(1);
    this.pop(s, 1.4);
  }

  /** A word over archer `id` (once per window), above its number. */
  word(id: number, x: number, y: number, text: string, color: number, size = 62): void {
    if (this.find(id, 'word')) return;
    const s = this.take();
    Object.assign(s, { id, kind: 'word', total: 0, age: 0, life: 0.9, x, y: y - 120, active: true });
    s.text.setText(text).setFontSize(size).setColor(cssColor(color)).setVisible(true).setAlpha(1);
    this.pop(s, 0.5);
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        s.text.setVisible(false);
        continue;
      }
      const t = s.age / s.life;
      const sc = s.text.scaleX + (1 - s.text.scaleX) * Math.min(1, dt * 14);
      s.text.setScale(sc).setPosition(s.x, s.y - t * 60).setAlpha(t < 0.7 ? 1 : (1 - t) / 0.3);
    }
  }
}

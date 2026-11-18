/**
 * Damage numbers, hit words, call-outs and floating notes as DOM text in the stage overlay
 * (crisp at any pixel ratio). A port of the 2D game's scenes/numbers.ts, GameScene.callout and
 * juice.floatText, with the same merge window, pops, rise and fade.
 *
 * Numbers and words: hits on the same archer within a short window add up into one number (it
 * pops as it grows), and a word ("HEADSHOT!", "KO!") shows at most once per archer per window.
 * Everything is pooled: no elements are created during play.
 */
import { PALETTE } from '@okcu/textures';
import { type Stage } from '../../contract';
import { LOGICAL_H, LOGICAL_W } from '../../coords';

const MERGE = 0.7;
const HITS = 12;
const CALLS = 4;
const FLOATS = 6;

const css = (c: number): string => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
const backOut = (t: number): number => {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
};
const cubicOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

interface Slot {
  el: HTMLDivElement;
  back: HTMLSpanElement;
  front: HTMLSpanElement;
  kind: 'num' | 'word' | 'call' | 'float';
  active: boolean;
  id: number;
  total: number;
  age: number;
  life: number;
  /** logical px */
  x: number;
  y: number;
  size: number;
  stroke: number;
  scale: number;
  tilt: number;
  rise: number;
  sizeSet: number;
}

export class TextFx {
  private readonly layer: HTMLDivElement;
  private readonly hits: Slot[] = [];
  private readonly calls: Slot[] = [];
  private readonly floats: Slot[] = [];

  constructor(private readonly stage: Stage) {
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    stage.overlay.append(this.layer);
    const make = (kind: Slot['kind']): Slot => {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:0;top:0;display:none;white-space:nowrap;font-family:"Nunito",system-ui,sans-serif;font-weight:800;line-height:1;' +
        'will-change:transform,opacity;transform-origin:0 0;letter-spacing:0.01em';
      // two layers: the ink outline underneath, the coloured fill on top (the Phaser text's stroke)
      const back = document.createElement('span');
      back.style.cssText = `position:absolute;left:0;top:0;color:${css(PALETTE.ink)};-webkit-text-stroke-color:${css(PALETTE.ink)};stroke-linejoin:round`;
      const front = document.createElement('span');
      front.style.cssText = 'position:relative';
      el.append(back, front);
      this.layer.append(el);
      return { el, back, front, kind, active: false, id: -1, total: 0, age: 0, life: 0, x: 0, y: 0, size: 44, stroke: 9, scale: 1, tilt: 0, rise: 0, sizeSet: -1 };
    };
    for (let i = 0; i < HITS; i++) this.hits.push(make('num'));
    for (let i = 0; i < CALLS; i++) this.calls.push(make('call'));
    for (let i = 0; i < FLOATS; i++) this.floats.push(make('float'));
  }

  private find(id: number, kind: Slot['kind']): Slot | undefined {
    for (const s of this.hits) if (s.active && s.id === id && s.kind === kind && s.age < MERGE) return s;
    return undefined;
  }

  private take(list: Slot[]): Slot {
    let pick = list[0]!;
    for (const s of list) {
      if (!s.active) return s;
      if (s.age > pick.age) pick = s;
    }
    return pick;
  }

  private show(s: Slot, text: string, color: number): void {
    s.active = true;
    s.age = 0;
    s.back.textContent = text;
    s.front.textContent = text;
    s.front.style.color = css(color);
    s.el.style.display = 'block';
    s.el.style.opacity = '1';
    s.sizeSet = -1;
  }

  /** Add damage to archer `id`'s running number at logical (x, y). */
  damage(id: number, x: number, y: number, dmg: number, color: number, big: boolean): void {
    const prev = this.find(id, 'num');
    if (prev) {
      prev.total += dmg;
      prev.age = 0;
      prev.life = 0.95;
      prev.back.textContent = prev.front.textContent = String(Math.round(prev.total));
      prev.front.style.color = css(color);
      prev.scale = big ? 1.5 : 1.3;
      return;
    }
    const s = this.take(this.hits);
    s.kind = 'num';
    s.id = id;
    s.total = dmg;
    s.life = 0.95;
    s.x = x + 34;
    s.y = y - 40;
    s.size = big ? 54 : 44;
    s.stroke = 9;
    s.scale = 1.4;
    this.show(s, String(Math.round(dmg)), color);
  }

  /** A word over archer `id` (once per window), above its number. */
  word(id: number, x: number, y: number, text: string, color: number, size = 62): void {
    if (this.find(id, 'word')) return;
    const s = this.take(this.hits);
    s.kind = 'word';
    s.id = id;
    s.total = 0;
    s.life = 0.9;
    s.x = x;
    s.y = y - 120;
    s.size = size;
    s.stroke = 9;
    s.scale = 0.5;
    this.show(s, text, color);
  }

  /** A big punchy call-out in the upper sky (multi-kills, streaks, chains, focus). */
  callout(text: string, color: number, size: number): void {
    const s = this.take(this.calls);
    s.life = 1.08;
    s.x = LOGICAL_W / 2;
    s.y = 450;
    s.size = size;
    s.stroke = Math.round(size / 5);
    s.tilt = -6 + Math.random() * 12;
    this.show(s, text, color);
  }

  /** Rising text at a point (juice.floatText). */
  float(x: number, y: number, text: string, color: number, size = 48, rise = 90, duration = 0.65): void {
    const s = this.take(this.floats);
    s.life = 0.12 + duration;
    s.x = x;
    s.y = y;
    s.size = size;
    s.stroke = 8;
    s.rise = rise;
    this.show(s, text, color);
  }

  clear(): void {
    for (const list of [this.hits, this.calls, this.floats]) {
      for (const s of list) {
        if (!s.active) continue;
        s.active = false;
        s.el.style.display = 'none';
      }
    }
  }

  /** Hide the call-outs only (a card pick or the result is opening). */
  clearCalls(): void {
    for (const s of this.calls) {
      if (!s.active) continue;
      s.active = false;
      s.el.style.display = 'none';
    }
  }

  private place(s: Slot, x: number, y: number, scale: number, tilt: number, alpha: number, k: number): void {
    const px = s.size * k;
    if (s.sizeSet !== px) {
      s.sizeSet = px;
      s.el.style.fontSize = `${px.toFixed(1)}px`;
      s.back.style.webkitTextStrokeWidth = `${(s.stroke * k).toFixed(1)}px`;
    }
    const p = this.stage.toScreen(x, y);
    s.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)}) translate(-50%,-50%)`;
    s.el.style.opacity = alpha.toFixed(3);
  }

  /** `real`: real seconds (text ignores slow motion, like the 2D game's). */
  update(real: number): void {
    // CSS px per logical px
    const k = (this.stage.root.clientWidth || LOGICAL_W) / LOGICAL_W;
    for (const s of this.hits) {
      if (!s.active) continue;
      s.age += real;
      if (s.age >= s.life) {
        s.active = false;
        s.el.style.display = 'none';
        continue;
      }
      const t = s.age / s.life;
      s.scale += (1 - s.scale) * Math.min(1, real * 14);
      this.place(s, s.x, s.y - t * 60, s.scale, 0, t < 0.7 ? 1 : (1 - t) / 0.3, k);
    }
    for (const s of this.calls) {
      if (!s.active) continue;
      s.age += real;
      if (s.age >= s.life) {
        s.active = false;
        s.el.style.display = 'none';
        continue;
      }
      const pop = backOut(s.age / 0.22);
      const out = Math.max(0, (s.age - 0.7) / 0.38);
      this.place(s, s.x, Math.min(s.y, LOGICAL_H) - out * 70, 2.4 + (1 - 2.4) * pop, s.tilt * (1 - pop), 1 - out, k);
    }
    for (const s of this.floats) {
      if (!s.active) continue;
      s.age += real;
      if (s.age >= s.life) {
        s.active = false;
        s.el.style.display = 'none';
        continue;
      }
      const pop = backOut(s.age / 0.16);
      const out = cubicOut((s.age - 0.12) / (s.life - 0.12));
      this.place(s, s.x, s.y - out * s.rise, 0.6 + 0.4 * pop, 0, 1 - out, k);
    }
  }
}

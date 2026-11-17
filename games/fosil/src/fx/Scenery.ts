import Phaser from 'phaser';
import { shade } from '../art/fossils';
import { at, LAYERS } from '../sim/data';
import { PALETTE } from '../textures';

interface Actor {
  img: Phaser.GameObjects.Image;
  layer: number;
  kind: 'spore' | 'worm' | 'crystal' | 'shimmer' | 'snow' | 'ember' | 'fern' | 'amber' | 'bubble' | 'plankton' | 'shaft' | 'leviathan' | 'firefly' | 'drip' | 'mote' | 'heat' | 'jelly';
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** worm segment index / misc */
  k: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Per-layer tints for actors reused across layers. */
const TINTS: Record<number, Partial<Record<Actor['kind'], number>>> = {
  4: { fern: 0x1e3a24 },
  5: { amber: 0xffb030, drip: 0xffa020 },
  6: { crystal: 0xffd0e0, drip: 0xe8f4ff, shimmer: 0xffe0f0 },
  7: { crystal: 0xb07aff, shimmer: 0xd8b8ff, mote: 0xe0c8ff },
  8: { heat: 0x5a3a30 },
};

/**
 * The place behind the dig site: a baked background per layer (drawn once into a texture on
 * first visit) plus a pool of ambient actors updated by hand (roots and worms, frost and
 * crystals, ferns and embers, bubbles, plankton, light shafts and a passing silhouette).
 */
export class Scenery {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly actors: Actor[] = [];
  private layer = -1;
  private clock = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly site: { top: number; bottom: number; left: number; right: number },
  ) {
    this.bg = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setDepth(-20);
    const add = (layer: number, kind: Actor['kind'], tex: string, n: number): void => {
      for (let i = 0; i < n; i++) {
        const img = scene.add.image(0, 0, tex).setDepth(kind === 'leviathan' || kind === 'shaft' ? -15 : -6).setVisible(false);
        this.actors.push({ img, layer, kind, x: 0, y: 0, vx: 0, vy: 0, phase: Math.random() * 10, k: i });
      }
    };
    add(0, 'spore', 'oyun-dot', 14);
    add(0, 'worm', 'oyun-dot', 12); // two worms × 6 segments
    add(1, 'crystal', 'crystal', 9);
    add(1, 'shimmer', 'sheen', 1);
    add(1, 'snow', 'oyun-dot', 14);
    add(2, 'fern', 'fern', 4);
    add(2, 'amber', 'glow', 3);
    add(2, 'ember', 'oyun-dot', 16);
    add(3, 'shaft', 'ray', 3);
    add(3, 'leviathan', 'leviathan', 1);
    add(3, 'bubble', 'bubble', 14);
    add(3, 'plankton', 'oyun-dot', 18);
    // Coal Swamp: fireflies over black water, drips from the canopy
    add(4, 'firefly', 'glow', 10);
    add(4, 'drip', 'oyun-dot', 8);
    add(4, 'fern', 'fern', 4);
    // Amber Forest: slow golden drops and sun motes
    add(5, 'amber', 'glow', 5);
    add(5, 'mote', 'oyun-dot', 18);
    add(5, 'drip', 'glow', 5);
    // Salt Caves: twinkling salt crystals and brine drips
    add(6, 'crystal', 'crystal', 12);
    add(6, 'drip', 'oyun-dot', 10);
    add(6, 'shimmer', 'sheen', 1);
    // Crystal Geode: big violet crystals and a slow shimmer
    add(7, 'crystal', 'crystal', 16);
    add(7, 'shimmer', 'sheen', 1);
    add(7, 'mote', 'oyun-dot', 12);
    // Magma Vents: embers and heat haze rising
    add(8, 'ember', 'oyun-dot', 22);
    add(8, 'heat', 'glow', 6);
    // First Seas: light shafts, drifting discs, plankton
    add(9, 'shaft', 'ray', 3);
    add(9, 'jelly', 'bubble', 7);
    add(9, 'plankton', 'oyun-dot', 20);
  }

  setLayer(layer: number): void {
    if (layer === this.layer) return;
    this.layer = layer;
    const key = `scene-${layer}`;
    if (!this.scene.textures.exists(key)) this.bake(layer, key);
    this.bg.setTexture(key);
    for (const a of this.actors) {
      const on = a.layer === layer;
      a.img.setVisible(on);
      if (on) this.place(a, true);
    }
  }

  private sideX(): number {
    const s = this.site;
    return Math.random() < 0.5 ? rnd(s.left + 14, s.left + 120) : rnd(s.right - 120, s.right - 14);
  }

  private place(a: Actor, initial: boolean): void {
    const s = this.site;
    const h = s.bottom - s.top;
    const img = a.img;
    img.setAlpha(1).setScale(1).setRotation(0).clearTint();
    switch (a.kind) {
      case 'spore':
        a.x = rnd(s.left + 10, s.right - 10);
        a.y = initial ? rnd(s.top, s.bottom) : s.bottom + 10;
        a.vy = -rnd(8, 22);
        img.setTint(0xe9d9a8).setScale(rnd(0.25, 0.5)).setAlpha(rnd(0.25, 0.5));
        break;
      case 'worm':
        a.x = a.k < 6 ? s.left + 40 : s.right - 40;
        a.y = s.top + (a.k < 6 ? h * 0.35 : h * 0.7);
        img.setTint(a.k % 6 === 0 ? 0xc77a6a : 0xb5685a).setScale(a.k % 6 === 0 ? 0.95 : 0.85 - (a.k % 6) * 0.06);
        break;
      case 'crystal':
        a.x = this.sideX();
        a.y = rnd(s.top + 30, s.bottom - 30);
        img.setRotation(rnd(-0.6, 0.6)).setScale(rnd(0.6, 1.1));
        break;
      case 'shimmer':
        a.x = s.left - 80;
        a.y = (s.top + s.bottom) / 2;
        img.setTint(0xcff4ff).setAlpha(0.1).setRotation(0.35).setScale(1.4, 2.2);
        break;
      case 'snow':
        a.x = rnd(s.left, s.right);
        a.y = initial ? rnd(s.top, s.bottom) : s.top - 10;
        a.vy = rnd(14, 30);
        img.setTint(0xffffff).setScale(rnd(0.2, 0.45)).setAlpha(rnd(0.35, 0.7));
        break;
      case 'fern':
        a.x = a.k % 2 === 0 ? s.left + 30 + a.k * 14 : s.right - 30 - a.k * 10;
        a.y = s.bottom + 10;
        img.setOrigin(0.5, 1).setTint(a.k < 2 ? 0x2c4a20 : 0x3c5a2a).setScale(a.k < 2 ? 1 : 0.75).setAlpha(0.9);
        break;
      case 'amber':
        a.x = this.sideX();
        a.y = rnd(s.top + 60, s.bottom - 60);
        img.setTint(0xffa020).setScale(rnd(0.5, 0.8));
        break;
      case 'ember':
        a.x = rnd(s.left + 10, s.right - 10);
        a.y = initial ? rnd(s.top, s.bottom) : s.bottom + 10;
        a.vy = -rnd(25, 60);
        img.setTint(Math.random() < 0.5 ? 0xff8a30 : 0xffd060).setScale(rnd(0.22, 0.42));
        break;
      case 'shaft':
        a.x = s.left + 120 + a.k * 220 + rnd(-30, 30);
        a.y = s.top - 10;
        img.setOrigin(0.5, 0).setTint(0x9fe8ff).setScale(2.2, (h + 40) / 360).setRotation(0.18).setAlpha(0.12);
        break;
      case 'leviathan':
        a.x = initial ? s.right + 400 : s.right + 300;
        a.y = s.top + h * 0.3;
        a.vx = -26;
        img.setTint(0x0a1822).setAlpha(0.35).setScale(1.1);
        break;
      case 'bubble':
        a.x = this.sideX();
        a.y = initial ? rnd(s.top, s.bottom) : s.bottom + 10;
        a.vy = -rnd(30, 70);
        img.setTint(0xbfefff).setScale(rnd(0.35, 0.9)).setAlpha(0.6);
        break;
      case 'plankton':
        a.x = rnd(s.left, s.right);
        a.y = rnd(s.top, s.bottom);
        a.vx = rnd(-8, 8);
        a.vy = rnd(-5, 5);
        img.setTint(Math.random() < 0.3 ? 0x7fffd0 : 0xd8f0ff).setScale(rnd(0.15, 0.3)).setAlpha(rnd(0.3, 0.7));
        break;
      case 'firefly':
        a.x = this.sideX();
        a.y = rnd(s.top + 40, s.bottom - 40);
        a.vx = rnd(-14, 14);
        a.vy = rnd(-10, 10);
        img.setTint(0xb8ff6a).setScale(rnd(0.18, 0.3));
        break;
      case 'drip':
        a.x = this.sideX();
        a.y = initial ? rnd(s.top, s.bottom) : s.top - 10;
        a.vy = rnd(120, 220);
        img.setTint(0x9ad0c0).setScale(rnd(0.18, 0.3), rnd(0.35, 0.6)).setAlpha(0.6);
        break;
      case 'mote':
        a.x = rnd(s.left + 10, s.right - 10);
        a.y = initial ? rnd(s.top, s.bottom) : s.bottom + 10;
        a.vy = -rnd(6, 16);
        img.setTint(0xffe6a0).setScale(rnd(0.15, 0.35)).setAlpha(rnd(0.3, 0.6));
        break;
      case 'heat':
        a.x = rnd(s.left + 40, s.right - 40);
        a.y = initial ? rnd(s.top, s.bottom) : s.bottom + 40;
        a.vy = -rnd(20, 40);
        img.setScale(rnd(1, 1.8)).setAlpha(0.18);
        break;
      case 'jelly':
        a.x = this.sideX();
        a.y = initial ? rnd(s.top, s.bottom) : s.bottom + 30;
        a.vy = -rnd(10, 22);
        img.setTint(0xffc0f0).setScale(rnd(0.7, 1.2)).setAlpha(0.45);
        break;
    }
    const tint = TINTS[a.layer]?.[a.kind];
    if (tint !== undefined) img.setTint(tint);
    img.setPosition(a.x, a.y);
  }

  /** Ambient motion; `slow` slows everything down (grand reveal). */
  update(dt: number, slow = 1): void {
    const d = dt * slow;
    this.clock += d;
    const s = this.site;
    for (const a of this.actors) {
      if (a.layer !== this.layer) continue;
      const img = a.img;
      switch (a.kind) {
        case 'spore':
        case 'snow':
        case 'ember':
        case 'bubble':
        case 'drip':
        case 'mote':
        case 'heat':
        case 'jelly':
          if (a.kind === 'jelly') img.setScale(img.scaleX, img.scaleX * (0.8 + 0.2 * Math.sin(this.clock * 3 + a.phase)));
          if (a.kind === 'heat') img.setAlpha(0.1 + 0.08 * Math.sin(this.clock * 2 + a.phase));
          a.y += a.vy * d;
          a.x += Math.sin(this.clock * (a.kind === 'bubble' ? 3 : 1.2) + a.phase) * (a.kind === 'ember' ? 14 : 8) * d;
          if (a.kind === 'ember') img.setAlpha(0.5 + 0.5 * Math.sin(this.clock * 9 + a.phase));
          if (a.y < s.top - 20 || a.y > s.bottom + 20) this.place(a, false);
          img.setPosition(a.x, a.y);
          break;
        case 'worm': {
          // each worm peeks out of the wall, wriggles, and slides back in
          const head = a.k < 6 ? 0 : 6;
          const i = a.k - head;
          const cycle = (this.clock * 0.18 + (head ? 0.5 : 0)) % 1;
          const out = cycle < 0.6 ? Math.sin((cycle / 0.6) * Math.PI) : 0;
          const dir = head ? -1 : 1;
          const baseX = head ? s.right - 6 : s.left + 6;
          const t = this.clock * 4 - i * 0.6;
          img.setPosition(baseX + dir * (out * 70 - i * 9), a.y + Math.sin(t) * 6);
          img.setAlpha(out > 0.05 ? 1 : 0);
          break;
        }
        case 'crystal': {
          const tw = Math.max(0, Math.sin(this.clock * 1.3 + a.phase * 3));
          img.setAlpha(0.35 + tw * 0.6).setScale(0.6 + tw * 0.35);
          break;
        }
        case 'shimmer':
          a.x += 70 * d;
          if (a.x > s.right + 120) a.x = s.left - 160;
          img.setPosition(a.x, a.y);
          break;
        case 'fern':
          img.setRotation(Math.sin(this.clock * 0.9 + a.phase) * 0.06);
          break;
        case 'amber':
          img.setAlpha(0.18 + 0.12 * Math.sin(this.clock * 1.4 + a.phase));
          break;
        case 'shaft':
          img.setAlpha(0.07 + 0.06 * Math.sin(this.clock * 0.6 + a.phase));
          break;
        case 'leviathan':
          a.x += a.vx * d;
          img.setPosition(a.x, a.y + Math.sin(this.clock * 0.4) * 10);
          if (a.x < s.left - 500) this.place(a, false);
          break;
        case 'firefly': {
          a.x += (a.vx + Math.sin(this.clock * 1.7 + a.phase) * 18) * d;
          a.y += (a.vy + Math.cos(this.clock * 1.3 + a.phase) * 12) * d;
          const on = Math.max(0, Math.sin(this.clock * 2.2 + a.phase * 2));
          img.setAlpha(0.15 + on * 0.85);
          if (a.x < s.left || a.x > s.right || a.y < s.top || a.y > s.bottom) this.place(a, false);
          img.setPosition(a.x, a.y);
          break;
        }
        case 'plankton':
          a.x += (a.vx + Math.sin(this.clock + a.phase) * 6) * d;
          a.y += a.vy * d;
          if (a.x < s.left || a.x > s.right || a.y < s.top || a.y > s.bottom) this.place(a, false);
          img.setPosition(a.x, a.y);
          break;
      }
    }
  }

  /** The layer backdrop, drawn once per layer into a texture. */
  private bake(layer: number, key: string): void {
    const { width, height } = this.scene.scale.gameSize;
    const L = at(LAYERS, layer);
    const s = this.site;
    const g = this.scene.add.graphics();
    g.fillStyle(L.sky, 1).fillRect(0, 0, width, height);
    // vertical light-to-dark gradient over the site
    const top = layer === 3 || layer === 9 ? shade(L.sky, 0.18) : layer === 5 ? shade(L.sky, 0.22) : shade(L.sky, 0.08);
    const bottom = layer === 2 ? shade(0x5a2a10, -0.2) : layer === 8 ? 0x6a1a08 : shade(L.sky, -0.25);
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(top), Phaser.Display.Color.ValueToColor(bottom), 23, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, s.top - 40 + t * (height - s.top + 40), width, (height - s.top + 40) / 23 + 2);
    }
    const band = (y: number, color: number, alpha: number): void => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 12; k++) pts.push(new Phaser.Math.Vector2((width * k) / 12, y + Math.sin(k * 1.3 + layer) * 10));
      pts.push(new Phaser.Math.Vector2(width, y + 34), new Phaser.Math.Vector2(0, y + 34));
      g.fillStyle(color, alpha).fillPoints(pts, true);
    };
    for (let i = 0; i < 8; i++) band(s.top + 20 + i * ((s.bottom - s.top) / 8), at(L.bands, i % L.bands.length), 0.12);

    if (layer === 0) {
      // roots reaching down the walls, pebbles, grass at the top edge
      for (let r = 0; r < 9; r++) {
        const left = r % 2 === 0;
        let x = left ? s.left + 10 + r * 6 : s.right - 10 - r * 6;
        let y = s.top - 10;
        let w = 7;
        for (let k = 0; k < 9; k++) {
          const nx = x + (left ? 1 : -1) * rnd(-6, 20);
          const ny = y + rnd(28, 60);
          g.lineStyle(w, 0x1e110a, 0.75).lineBetween(x, y, nx, ny);
          if (k % 3 === 1) g.lineStyle(2, 0x1e110a, 0.6).lineBetween(nx, ny, nx + (left ? 24 : -24), ny + 16);
          x = nx;
          y = ny;
          w = Math.max(2, w - 0.6);
        }
      }
      for (let i = 0; i < 30; i++) g.fillStyle(shade(at(L.bands, i % 5), Math.random() < 0.5 ? -0.3 : 0.2), 0.7).fillEllipse(this.sideX(), rnd(s.top, s.bottom), rnd(10, 26), rnd(8, 18));
      for (let x = 0; x < width; x += 14) g.fillStyle(0x4a6a2a, 0.8).fillTriangle(x, s.top - 8, x + 6, s.top - 8 - rnd(10, 24), x + 12, s.top - 8);
    } else if (layer === 1) {
      // ice walls: pale streaks, frost stars, icicles under the top edge
      for (let i = 0; i < 26; i++) g.fillStyle(0xdff6ff, rnd(0.05, 0.12)).fillRect(rnd(0, width), s.top, rnd(4, 18), s.bottom - s.top);
      for (let i = 0; i < 34; i++) {
        const x = this.sideX();
        const y = rnd(s.top + 10, s.bottom - 10);
        const r = rnd(5, 12);
        g.lineStyle(2, 0xffffff, 0.45);
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3;
          g.lineBetween(x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
      }
      for (let x = 8; x < width; x += rnd(22, 40)) g.fillStyle(0xdff6ff, 0.55).fillTriangle(x, s.top - 6, x + 14, s.top - 6, x + 7, s.top - 6 + rnd(18, 54));
    } else if (layer === 2) {
      // warm rock: amber nodules with highlights, a glow from below, fern shadows at the base
      for (let i = 0; i < 12; i++) {
        const x = this.sideX();
        const y = rnd(s.top + 30, s.bottom - 40);
        const r = rnd(8, 18);
        g.fillStyle(0xe08a1a, 0.55).fillCircle(x, y, r);
        g.fillStyle(0xffd060, 0.6).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.35);
      }
      for (let i = 0; i < 6; i++) g.fillStyle(0xff7a20, 0.05).fillEllipse(width / 2, s.bottom + 20, width * (0.5 + i * 0.18), 160 + i * 40);
    } else if (layer >= 4) {
      this.bakeDeep(g, layer, width);
    } else {
      // sea floor: rippled sand, kelp, coral lumps; the water darkens with depth
      band(s.bottom - 60, 0xc7b58a, 0.25);
      band(s.bottom - 34, 0xa8956a, 0.35);
      for (let k = 0; k < 6; k++) {
        const x = k < 3 ? s.left + 20 + k * 28 : s.right - 20 - (k - 3) * 28;
        let y = s.bottom;
        for (let i = 0; i < 12; i++) {
          const ny = y - 34;
          g.lineStyle(7, 0x1f5a4a, 0.6).lineBetween(x + Math.sin(i * 0.9 + k) * 10, y, x + Math.sin((i + 1) * 0.9 + k) * 10, ny);
          y = ny;
          if (y < s.top + 160) break;
        }
      }
      for (let i = 0; i < 8; i++) g.fillStyle(i % 2 ? 0x8a3a5a : 0xc06a8a, 0.45).fillCircle(this.sideX(), s.bottom - rnd(20, 60), rnd(10, 20));
    }
    // the dig pit and a dark band behind the HUD so readouts stay the most readable thing
    g.fillStyle(PALETTE.dirtDark, 0.45).fillRoundedRect(s.left + 14, s.top - 10, s.right - s.left - 28, s.bottom - s.top + 20, 30);
    g.fillStyle(0x000000, 0.45).fillRect(0, 0, width, s.top - 16);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  /** Backdrops of the six deep layers. */
  private bakeDeep(g: Phaser.GameObjects.Graphics, layer: number, width: number): void {
    const s = this.site;
    const h = s.bottom - s.top;
    if (layer === 4) {
      // Coal Swamp: giant horsetail trunks, black water, coal seams glinting
      for (let k = 0; k < 6; k++) {
        const x = k < 3 ? s.left + 30 + k * 40 : s.right - 30 - (k - 3) * 40;
        g.fillStyle(0x0e1a10, 0.8).fillRect(x - 9, s.top - 20, 18, h + 40);
        for (let y = s.top; y < s.bottom; y += 46) {
          g.fillStyle(0x1a2e1a, 0.9).fillRect(x - 12, y, 24, 6);
          g.lineStyle(3, 0x1e3a24, 0.7).lineBetween(x, y + 3, x + (k < 3 ? 34 : -34), y - 18);
        }
      }
      for (let i = 0; i < 7; i++) g.fillStyle(0x050807, 0.55).fillRect(0, s.top + rnd(0, h), width, rnd(4, 10));
      for (let i = 0; i < 26; i++) g.fillStyle(0x9ab0c0, 0.35).fillRect(this.sideX(), rnd(s.top, s.bottom), rnd(3, 8), 2);
      g.fillStyle(0x0a1410, 0.7).fillRect(0, s.bottom - 40, width, 60);
    } else if (layer === 5) {
      // Amber Forest: pine trunks weeping amber, warm light from above
      for (let k = 0; k < 4; k++) {
        const x = k < 2 ? s.left + 40 + k * 60 : s.right - 40 - (k - 2) * 60;
        g.fillStyle(0x3a2412, 0.85).fillRect(x - 16, s.top - 20, 32, h + 40);
        g.fillStyle(0x5a3a1a, 0.6).fillRect(x - 10, s.top - 20, 6, h + 40);
        for (let i = 0; i < 4; i++) {
          const y = s.top + rnd(20, h - 20);
          g.fillStyle(0xffa020, 0.75).fillEllipse(x + rnd(-10, 10), y, 14, 22);
          g.fillStyle(0xffe08a, 0.8).fillCircle(x - 3, y - 6, 3);
        }
      }
      for (let i = 0; i < 5; i++) g.fillStyle(0xffd070, 0.05).fillEllipse(width / 2, s.top, width * (0.4 + i * 0.2), 200 + i * 60);
    } else if (layer === 6) {
      // Salt Caves: white and pink stalactites, cubic salt on the walls
      for (let x = 6; x < width; x += rnd(26, 46)) {
        const len = rnd(30, 110);
        g.fillStyle(Math.random() < 0.4 ? 0xffd0e0 : 0xf4f0ff, 0.6).fillTriangle(x, s.top - 6, x + 20, s.top - 6, x + 10, s.top - 6 + len);
      }
      for (let i = 0; i < 30; i++) {
        const x = this.sideX();
        const y = rnd(s.top + 20, s.bottom - 20);
        const r = rnd(6, 16);
        g.fillStyle(i % 3 ? 0xf4f0ff : 0xffc0d8, 0.45).fillRect(x - r / 2, y - r / 2, r, r);
        g.lineStyle(1, 0xffffff, 0.6).strokeRect(x - r / 2, y - r / 2, r, r);
      }
      for (let x = 10; x < width; x += rnd(30, 60)) g.fillStyle(0xf4f0ff, 0.5).fillTriangle(x, s.bottom + 10, x + 26, s.bottom + 10, x + 13, s.bottom + 10 - rnd(20, 70));
    } else if (layer === 7) {
      // Crystal Geode: the pit is a cracked geode, crystals pointing inward from every wall
      const cx = width / 2;
      const cy = (s.top + s.bottom) / 2;
      for (let i = 0; i < 70; i++) {
        const a = rnd(0, Math.PI * 2);
        const rx = (s.right - s.left) / 2 + 30;
        const ry = h / 2 + 30;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        const len = rnd(40, 120);
        const tx = x - Math.cos(a) * len;
        const ty = y - Math.sin(a) * len;
        const n = { x: -Math.sin(a) * 12, y: Math.cos(a) * 12 };
        g.fillStyle(i % 3 === 0 ? 0xd8b8ff : i % 3 === 1 ? 0x8a4ae0 : 0xb07aff, 0.55).fillTriangle(x + n.x, y + n.y, x - n.x, y - n.y, tx, ty);
        g.lineStyle(1, 0xffffff, 0.35).lineBetween(x, y, tx, ty);
      }
    } else if (layer === 8) {
      // Magma Vents: black basalt, glowing lava rivers in the walls, a red glow from below
      for (let k = 0; k < 7; k++) {
        let x = rnd(0, width);
        let y = s.top;
        for (let i = 0; i < 10 && y < s.bottom; i++) {
          const nx = x + rnd(-40, 40);
          const ny = y + rnd(40, 90);
          g.lineStyle(10, 0xff5a10, 0.18).lineBetween(x, y, nx, ny);
          g.lineStyle(3, 0xffb040, 0.7).lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
      for (let i = 0; i < 6; i++) g.fillStyle(0xff4a10, 0.06).fillEllipse(width / 2, s.bottom + 30, width * (0.5 + i * 0.2), 180 + i * 50);
      for (let x = 0; x < width; x += rnd(40, 80)) g.fillStyle(0x1a0c08, 0.85).fillTriangle(x, s.bottom + 20, x + 60, s.bottom + 20, x + 30, s.bottom - rnd(20, 60));
    } else {
      // First Seas: a bright shallow sea, quilted fronds and discs printed in the mud
      band(this, g, s.bottom - 50, 0x9ac8b0, 0.3, width, layer);
      for (let k = 0; k < 8; k++) {
        const x = k < 4 ? s.left + 24 + k * 26 : s.right - 24 - (k - 4) * 26;
        const top = s.bottom - rnd(120, 260);
        g.lineStyle(3, 0x2a6e6a, 0.7).lineBetween(x, s.bottom, x, top);
        for (let y = top; y < s.bottom - 10; y += 12) g.fillStyle(0x3a8a80, 0.55).fillEllipse(x, y, 26, 8);
      }
      for (let i = 0; i < 10; i++) {
        const x = this.sideX();
        const y = rnd(s.top + 60, s.bottom - 60);
        g.lineStyle(2, 0xbfe8e0, 0.4).strokeCircle(x, y, rnd(10, 22));
        g.lineStyle(1, 0xbfe8e0, 0.3).strokeCircle(x, y, rnd(4, 8));
      }
    }
  }
}

function band(_s: Scenery, g: Phaser.GameObjects.Graphics, y: number, color: number, alpha: number, width: number, layer: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let k = 0; k <= 12; k++) pts.push(new Phaser.Math.Vector2((width * k) / 12, y + Math.sin(k * 1.3 + layer) * 10));
  pts.push(new Phaser.Math.Vector2(width, y + 34), new Phaser.Math.Vector2(0, y + 34));
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

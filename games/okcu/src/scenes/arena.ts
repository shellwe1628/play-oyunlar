/**
 * The arena behind the action: baked theme layers with a cross-fade between themes, drifting
 * clouds, the ambient layer and the baked ledges. Owns its textures (at most two themes and
 * two ledge sets live at once) and frees them on shutdown.
 */
import Phaser from 'phaser';
import { THEMES, type Theme } from '../anim/themes';
import type { Ledge } from '../sim/body';
import { PALETTE } from '../textures';
import { Ambient, drawThemeBack, drawThemeLedge, drawThemeNear, LANTERN_Y } from './worlds';

const W = 720;
const H = 1280;

const MPAD = 40;
const MPAD_TOP = 90;

export class Arena {
  private readonly back: Phaser.GameObjects.Image[] = [];
  private readonly near: Phaser.GameObjects.Image[] = [];
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly ambientG: Phaser.GameObjects.Graphics;
  private readonly lantern: Phaser.GameObjects.Graphics;
  private readonly ledges: Phaser.GameObjects.Image;
  /** moving ledges: each baked once per stage into its own small texture, then just moved */
  private readonly movers: Phaser.GameObjects.Image[] = [];
  private moverIdx: number[] = [];
  private readonly ambient = new Ambient(W, H);
  private slot = 0;
  private ledgeSlot = 0;
  private ledgeKey = '';
  theme: Theme = THEMES[0]!;
  index = -1;
  private time = 0;
  /** measurement aid: ambient layer off */
  ambientOn = true;
  /** the stage's wind: drifts clouds, snow and sand */
  wind = 0;

  constructor(private readonly scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    for (let i = 0; i < 2; i++) this.back.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false));
    layer.add(this.back);
    for (let i = 0; i < 5; i++) {
      const c = scene.add.image(Math.random() * W, 120 + i * 150 + Math.random() * 60, 'cloud').setScale(0.5 + Math.random() * 0.7);
      c.setData('v', 8 + Math.random() * 16);
      this.clouds.push(c);
    }
    layer.add(this.clouds);
    for (let i = 0; i < 2; i++) this.near.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false));
    layer.add(this.near);
    this.lantern = scene.add.graphics();
    this.ambientG = scene.add.graphics();
    this.ledges = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false);
    layer.add([this.lantern, this.ambientG, this.ledges]);
    for (let i = 0; i < 4; i++) this.movers.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false));
    layer.add(this.movers);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // textures are global: drop this arena's ledge bakes (theme bakes are reused next run)
      for (const k of ['okcu-ledges-0', 'okcu-ledges-1', 'okcu-mover-0', 'okcu-mover-1', 'okcu-mover-2', 'okcu-mover-3']) if (scene.textures.exists(k)) scene.textures.remove(k);
    });
  }

  private bake(key: string, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, W, H);
    g.destroy();
  }

  /** Switch to theme `index`; cross-fades unless `instant`. */
  setTheme(index: number, instant: boolean): void {
    if (index === this.index) return;
    const prev = this.index;
    this.index = index;
    this.theme = THEMES[index]!;
    const th = this.theme;
    const kb = `okcu-th-${th.id}-back`;
    const kn = `okcu-th-${th.id}-near`;
    this.bake(kb, (g) => drawThemeBack(g, th, W, H));
    this.bake(kn, (g) => drawThemeNear(g, th, W, H));
    // keep at most two themes baked
    for (const t of THEMES) {
      if (t.id === th.id || (prev >= 0 && t.id === THEMES[prev]!.id)) continue;
      for (const k of [`okcu-th-${t.id}-back`, `okcu-th-${t.id}-near`]) if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    }
    const s = (this.slot = 1 - this.slot);
    const nb = this.back[s]!.setTexture(kb).setVisible(true);
    const nn = this.near[s]!.setTexture(kn).setVisible(true);
    const ob = this.back[1 - s]!;
    const on = this.near[1 - s]!;
    if (instant || prev < 0) {
      nb.setAlpha(1);
      nn.setAlpha(1);
      ob.setVisible(false);
      on.setVisible(false);
    } else {
      nb.setAlpha(0);
      nn.setAlpha(0);
      this.scene.tweens.add({ targets: [nb, nn], alpha: 1, duration: 900, ease: 'Sine.easeInOut', onComplete: () => {
        ob.setVisible(false);
        on.setVisible(false);
      } });
    }
    // keep the old back drawn under the new one during the fade
    const parent = nb.parentContainer;
    if (parent) {
      parent.moveAbove(nb, ob);
      parent.moveAbove(nn, on);
    }
    for (const c of this.clouds) c.setTint(th.cloud).setAlpha(th.cloudAlpha);
    this.scene.cameras.main.setBackgroundColor(th.skyTop);
    this.ledgeKey = ''; // re-bake the ledges in the new materials
  }

  /** Bake the static ledges (moving ones, listed in `skip` by index, are drawn every frame). */
  setLedges(ledges: readonly Ledge[], seed: number, skip: readonly number[] = []): void {
    const key = `${this.theme.id}|${ledges.map((l, i) => (skip.includes(i) ? 'm' : `${Math.round(l.x)},${Math.round(l.y)}`)).join('|')}`;
    if (key === this.ledgeKey) return;
    this.ledgeKey = key;
    this.ledgeSlot = 1 - this.ledgeSlot;
    const tex = `okcu-ledges-${this.ledgeSlot}`;
    if (this.scene.textures.exists(tex)) this.scene.textures.remove(tex);
    const th = this.theme;
    this.bake(tex, (g) => ledges.forEach((l, i) => {
      if (!skip.includes(i)) drawThemeLedge(g, l, i + seed, th);
    }));
    this.ledges.setTexture(tex).setVisible(true);
    // the moving ones: one small bake each
    this.moverIdx = [...skip];
    this.movers.forEach((img, k) => {
      const i = skip[k];
      const L = i !== undefined ? ledges[i] : undefined;
      if (!L) {
        img.setVisible(false);
        return;
      }
      const key = `okcu-mover-${k}`;
      img.setTexture('__DEFAULT');
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      const g = this.scene.make.graphics({}, false);
      drawThemeLedge(g, { x: MPAD, y: MPAD_TOP, w: L.w, h: L.h }, i! + seed, th);
      g.generateTexture(key, L.w + MPAD * 2, MPAD_TOP + L.h * 2.6 + L.w * 0.3 + 60);
      g.destroy();
      img.setTexture(key).setVisible(true);
    });
  }

  /** Follow the moving ledges this frame (cut ones fall away). */
  moveLedges(ledges: readonly Ledge[]): void {
    for (let k = 0; k < this.movers.length; k++) {
      const i = this.moverIdx[k];
      const L = i !== undefined ? ledges[i] : undefined;
      const img = this.movers[k]!;
      if (!L || !img.visible) continue;
      img.setPosition(L.x - MPAD, L.y - MPAD_TOP);
    }
  }

  update(real: number, pushX: number, pushY: number): void {
    this.time += real;
    for (let i = 0; i < 2; i++) {
      this.back[i]!.setPosition(-pushX * 0.5 * 0.4, -pushY * 0.3 * 0.4);
      this.near[i]!.setPosition(-pushX * 0.25, -pushY * 0.15);
    }
    for (const c of this.clouds) {
      c.x += ((c.getData('v') as number) + this.wind * 0.12) * real;
      if (c.x > W + 160) c.x = -160;
      if (c.x < -160) c.x = W + 160;
    }
    if (!this.ambientOn) {
      this.ambientG.clear();
      this.lantern.clear();
      return;
    }
    this.ambient.update(real, this.theme, this.wind);
    this.ambient.draw(this.ambientG, this.theme);
    this.drawLanterns();
  }

  /** Night theme: the baked lanterns' glow pulses (nine soft circles). */
  private drawLanterns(): void {
    const g = this.lantern;
    g.clear();
    if (this.theme.id !== 'night') return;
    const t = this.time;
    for (let i = 0; i < 3; i++) {
      for (let k = 2; k < 8; k += 2) {
        const u = k / 8;
        const x = 60 + i * 200 + 200 * u;
        const y = LANTERN_Y + Math.sin(u * Math.PI) * 34 + 10;
        const glow = 0.6 + Math.sin(t * 3 + k + i * 2) * 0.4;
        g.fillStyle(PALETTE.lantern, 0.25 * glow).fillCircle(x, y, 20);
      }
    }
  }
}

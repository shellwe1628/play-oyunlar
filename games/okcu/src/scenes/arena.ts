/**
 * The arena behind the action: baked theme layers with a cross-fade between themes, drifting
 * clouds, the ambient layer and the baked ledges. Owns its textures (at most two themes and
 * two ledge sets live at once) and frees them on shutdown.
 */
import Phaser from 'phaser';
import { THEMES, type Theme } from '../anim/themes';
import type { Ledge } from '../sim/body';
import { PALETTE } from '../textures';
import { Ambient, drawThemeBack, drawThemeLedge, drawThemeNear } from './worlds';

const W = 720;
const H = 1280;

export class Arena {
  private readonly back: Phaser.GameObjects.Image[] = [];
  private readonly near: Phaser.GameObjects.Image[] = [];
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly ambientG: Phaser.GameObjects.Graphics;
  private readonly lantern: Phaser.GameObjects.Graphics;
  private readonly ledges: Phaser.GameObjects.Image;
  private readonly ambient = new Ambient(W, H);
  private slot = 0;
  private ledgeSlot = 0;
  private ledgeKey = '';
  theme: Theme = THEMES[0]!;
  index = -1;
  private time = 0;
  /** measurement aid: ambient layer off */
  ambientOn = true;

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
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // textures are global: drop this arena's ledge bakes (theme bakes are reused next run)
      for (const k of ['okcu-ledges-0', 'okcu-ledges-1']) if (scene.textures.exists(k)) scene.textures.remove(k);
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

  setLedges(ledges: readonly Ledge[], seed: number): void {
    const key = `${this.theme.id}|${ledges.map((l) => `${Math.round(l.x)},${Math.round(l.y)}`).join('|')}`;
    if (key === this.ledgeKey) return;
    this.ledgeKey = key;
    this.ledgeSlot = 1 - this.ledgeSlot;
    const tex = `okcu-ledges-${this.ledgeSlot}`;
    if (this.scene.textures.exists(tex)) this.scene.textures.remove(tex);
    const th = this.theme;
    this.bake(tex, (g) => ledges.forEach((l, i) => drawThemeLedge(g, l, i + seed, th)));
    this.ledges.setTexture(tex).setVisible(true);
  }

  update(real: number, pushX: number, pushY: number): void {
    this.time += real;
    for (let i = 0; i < 2; i++) {
      this.back[i]!.setPosition(-pushX * 0.5 * 0.4, -pushY * 0.3 * 0.4);
      this.near[i]!.setPosition(-pushX * 0.25, -pushY * 0.15);
    }
    for (const c of this.clouds) {
      c.x += (c.getData('v') as number) * real;
      if (c.x > W + 160) c.x = -160;
    }
    if (!this.ambientOn) {
      this.ambientG.clear();
      this.lantern.clear();
      return;
    }
    this.ambient.update(real, this.theme);
    this.ambient.draw(this.ambientG, this.theme);
    this.drawLanterns();
  }

  /** Night theme: a string of lanterns swaying between the hill posts. */
  private drawLanterns(): void {
    const g = this.lantern;
    g.clear();
    if (this.theme.id !== 'night') return;
    const t = this.time;
    for (let i = 0; i < 3; i++) {
      const x0 = 60 + i * 200;
      const x1 = x0 + 200;
      const y0 = 868;
      const sway = Math.sin(t * 1.3 + i) * 6;
      let px = x0;
      let py = y0;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + Math.sin(u * Math.PI) * (34 + sway);
        g.lineStyle(2, PALETTE.ink, 0.8).lineBetween(px, py, x, y);
        px = x;
        py = y;
        if (k % 2 === 0 && k < 8) {
          const glow = 0.7 + Math.sin(t * 3 + k + i) * 0.3;
          g.fillStyle(PALETTE.lantern, 0.22 * glow).fillCircle(x, y + 10, 16);
          g.fillStyle(k % 4 === 0 ? PALETTE.lantern : PALETTE.pink, 1).fillRoundedRect(x - 6, y + 2, 12, 15, 5);
        }
      }
    }
  }
}

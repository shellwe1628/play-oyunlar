/**
 * Screen-space backdrop behind the shaft: a two-colour gradient that shifts with progress, big
 * outline shapes that drift (parallax) and pulse on the beat, and speed streaks. Four layers of
 * quads, recoloured per frame; nothing is redrawn.
 */
import Phaser from 'phaser';
import type { Palette } from '../textures';

const SHAPES = 0; // the level worlds (World.ts) replaced the generic outline shapes
const STREAKS = 14;

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export class Backdrop {
  private readonly base: Phaser.GameObjects.Rectangle;
  private readonly grad: Phaser.GameObjects.Image;
  private readonly shapes: Phaser.GameObjects.Image[] = [];
  private readonly shapeY: number[] = [];
  private readonly streaks: Phaser.GameObjects.Image[] = [];
  private readonly vignette: Phaser.GameObjects.Image;
  private pal: Palette;
  /** Current colours (for UI that wants to match). */
  top = 0;
  bottom = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    pal: Palette,
    private readonly w: number,
    private readonly h: number,
  ) {
    this.pal = pal;
    this.base = scene.add.rectangle(0, 0, w, h, pal.bottom).setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    this.grad = scene.add.image(0, 0, 'bg-grad').setOrigin(0, 0).setDisplaySize(w, h).setScrollFactor(0).setDepth(-99);
    for (let i = 0; i < SHAPES; i++) {
      const img = scene.add
        .image((i * 233) % w, 0, i % 2 ? 'bg-ring' : 'bg-diamond')
        .setScrollFactor(0)
        .setDepth(-98)
        .setAlpha(0.13)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.6 + (i % 3) * 0.45)
        .setAngle(i * 17);
      this.shapes.push(img);
      this.shapeY.push((i / SHAPES) * (h + 400) - 200);
    }
    for (let i = 0; i < STREAKS; i++) {
      const s = scene.add
        .image((i * 151 + 40) % w, (i * 397) % h, 'streak')
        .setScrollFactor(0)
        .setDepth(-97)
        .setAlpha(0.22)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1, 0.8 + (i % 4) * 0.4);
      this.streaks.push(s);
    }
    this.vignette = scene.add.image(0, 0, 'vignette').setOrigin(0, 0).setDisplaySize(w, h).setScrollFactor(0).setDepth(50);
    this.setPalette(pal);
  }

  setPalette(pal: Palette): void {
    this.pal = pal;
    this.update(0, 0, 0, 0, 0);
  }

  /**
   * progress 0..1 shifts the gradient; dy = world px climbed since last frame drives the parallax;
   * pulse 0..1 (1 on the kick, decaying) scales the shapes; speed scales the streaks.
   */
  update(progress: number, dy: number, pulse: number, speed: number, dt: number): void {
    const p = this.pal;
    this.top = mix(p.top, p.top2, progress);
    this.bottom = mix(p.bottom, p.bottom2, progress);
    this.base.setFillStyle(this.bottom);
    this.grad.setTint(this.top);
    const h = this.h;
    for (let i = 0; i < SHAPES; i++) {
      let y = this.shapeY[i]! + dy * (0.25 + (i % 3) * 0.12);
      if (y > h + 260) y -= h + 520;
      this.shapeY[i] = y;
      const img = this.shapes[i]!;
      const base = 0.6 + (i % 3) * 0.45;
      img.setY(y).setScale(base * (1 + pulse * 0.12)).setAlpha(0.1 + pulse * 0.16);
      img.angle += dt * (i % 2 ? 8 : -6);
    }
    const sp = Math.min(1.6, speed / 520);
    for (let i = 0; i < STREAKS; i++) {
      const s = this.streaks[i]!;
      let y = s.y + dy * (1.3 + (i % 3) * 0.35);
      if (y > h + 100) {
        y -= h + 200;
        s.x = (s.x + 263) % this.w;
      }
      s.setY(y).setAlpha((0.12 + pulse * 0.12) * sp);
    }
  }

  setVisible(v: boolean): void {
    this.vignette.setVisible(v);
  }
}

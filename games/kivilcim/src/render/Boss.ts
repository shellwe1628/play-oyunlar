/**
 * The boss of a world's finale level: a big code-drawn eye in the backdrop (behind the shaft, so
 * it never covers the path), watching the spark, pulsing on the beat, cracking each time a
 * section is cleared, bursting at the finish. Its health is the share of sections left; the bar
 * lives in the HUD. Presentation only.
 */
import Phaser from 'phaser';

const BODY = [0xff7a1a, 0x3ff6ff, 0x9dff3a, 0xc35bff] as const;

export class Boss {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  readonly bar: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private world = 1;
  private hit = 0;
  private cracks = 0;
  private dead = 0;
  hp = 1;
  active = false;

  constructor(
    scene: Phaser.Scene,
    private readonly cx: number,
    private readonly cy: number,
    label: Phaser.GameObjects.Text,
  ) {
    this.glow = scene.add.image(cx, cy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(-96).setScale(5).setAlpha(0);
    this.g = scene.add.graphics().setDepth(-95.5);
    this.bar = scene.add.graphics();
    this.label = label;
  }

  setLevel(world: number, active: boolean): void {
    this.world = world;
    this.active = active;
    this.hp = 1;
    this.hit = 0;
    this.cracks = 0;
    this.dead = 0;
    this.g.setVisible(active);
    this.glow.setVisible(active);
    this.bar.setVisible(active);
    this.label.setVisible(active);
  }

  reset(): void {
    this.setLevel(this.world, this.active);
  }

  /** A section cleared: the boss takes a hit. */
  damage(hp: number): void {
    if (!this.active) return;
    this.hp = hp;
    this.hit = 1;
    this.cracks++;
  }

  defeat(): void {
    if (!this.active) return;
    this.hp = 0;
    this.dead = 1;
  }

  update(sparkX: number, pulse: number, now: number, dt: number, barX: number, barY: number, barW: number): void {
    if (!this.active) return;
    const g = this.g;
    g.clear();
    this.hit = Math.max(0, this.hit - dt * 3);
    if (this.dead > 0) this.dead = Math.min(3, this.dead + dt * 2);
    const col = BODY[(this.world - 1) % BODY.length]!;
    const fade = this.dead > 0 ? Math.max(0, 1 - (this.dead - 1) / 1.2) : 1;
    const s = (1 + 0.05 * pulse + 0.12 * this.hit) * (this.dead > 0 ? 1 + (this.dead - 1) * 0.6 : 1);
    const x = this.cx + Math.sin(now / 1300) * 30;
    const y = this.cy + Math.sin(now / 900) * 14;
    this.glow.setPosition(x, y).setTint(this.hit > 0.2 ? 0xffffff : col).setAlpha((0.35 + 0.25 * pulse + 0.4 * this.hit) * fade);
    if (fade <= 0) return;
    const a = 0.62 * fade;
    // Rotating armour: shards around the core, gaps where it has been hit.
    const n = 10;
    for (let k = 0; k < n; k++) {
      if (k < this.cracks % (n + 1) && k % 2 === 0) continue;
      const ang = now / 2200 + (k * Math.PI * 2) / n;
      const r0 = 150 * s;
      const r1 = 205 * s;
      g.fillStyle(col, a * 0.8);
      g.beginPath();
      g.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      g.lineTo(x + Math.cos(ang + 0.42) * r1, y + Math.sin(ang + 0.42) * r1);
      g.lineTo(x + Math.cos(ang + 0.5) * r0, y + Math.sin(ang + 0.5) * r0);
      g.closePath();
      g.fillPath();
    }
    // The eye.
    g.fillStyle(0x14062b, a).fillCircle(x, y, 132 * s);
    g.lineStyle(10, col, a).strokeCircle(x, y, 132 * s);
    g.fillStyle(0xffffff, a * 0.9).fillEllipse(x, y, 210 * s, (120 - 50 * this.hit) * s);
    const look = Math.max(-1, Math.min(1, (sparkX - 360) / 260));
    const ix = x + look * 52 * s;
    g.fillStyle(col, a).fillCircle(ix, y, 44 * s);
    g.fillStyle(0x14062b, a).fillCircle(ix, y, 20 * s * (1 + pulse * 0.3));
    g.fillStyle(0xffffff, a).fillCircle(ix - 12 * s, y - 14 * s, 8 * s);
    // Cracks across the eye.
    for (let c = 0; c < Math.min(6, this.cracks); c++) {
      const ang = c * 2.1 + 0.4;
      g.lineStyle(4, 0xffffff, a * 0.8).lineBetween(x + Math.cos(ang) * 40 * s, y + Math.sin(ang) * 40 * s, x + Math.cos(ang + 0.2) * 128 * s, y + Math.sin(ang + 0.2) * 128 * s);
    }
    // Health bar in the HUD.
    const b = this.bar;
    b.clear();
    b.fillStyle(0x000000, 0.5).fillRoundedRect(barX - 4, barY - 4, barW + 8, 18, 9);
    b.fillStyle(0xff3d5a, 1).fillRoundedRect(barX, barY, Math.max(4, barW * this.hp), 10, 5);
    if (this.hit > 0) b.fillStyle(0xffffff, this.hit).fillRoundedRect(barX, barY, Math.max(4, barW * this.hp), 10, 5);
  }
}

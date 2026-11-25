import type Phaser from 'phaser';
import { FLURRY_GAP, pickTier } from './model';

const RAISED = 0.55; // clockwise: head lifted
const STRUCK = -0.45; // counter-clockwise: head down on the strike point
const DOWN = 0.055; // s, raised → struck
const UP = 0.14; // s, back up
/** Head offset from the pivot (handle end) in texture px, at rotation 0. */
const HEAD = { x: -62, y: -86 };

/**
 * The player's pickaxe. Each tap restarts the strike (no queue): at high tap rates it never lags
 * behind input; instead two ghost copies trail it and it reads as a blurred flurry.
 */
export class Pickaxe {
  private readonly img: Phaser.GameObjects.Image;
  private readonly ghosts: Phaser.GameObjects.Image[];
  private t = 99; // seconds since the last strike
  private gap = 1; // seconds between the last two strikes
  private tier = -1;
  private rest = { x: 0, y: 0 };
  private idle = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    this.img = scene.add.image(0, 0, 'pick-0').setOrigin(0.9, 0.92).setDepth(depth);
    this.ghosts = [0, 1].map(() => scene.add.image(0, 0, 'pick-0').setOrigin(0.9, 0.92).setDepth(depth - 1).setVisible(false));
  }

  /** Pivot position and seconds since the last strike (test state). */
  get state(): { x: number; y: number; t: number } {
    return { x: Math.round(this.img.x), y: Math.round(this.img.y), t: Math.round(this.t * 100) / 100 };
  }

  setTier(level: number): void {
    const t = pickTier(level);
    if (t === this.tier) return;
    this.tier = t;
    this.img.setTexture(`pick-${t}`);
    for (const g of this.ghosts) g.setTexture(`pick-${t}`);
  }

  /** Where the pick waits between taps (beside the block). */
  setRest(x: number, y: number): void {
    this.rest = { x, y };
    if (this.t > 1) this.img.setPosition(x, y);
  }

  /** A tap at (x, y): place the pivot so the head lands on the strike point and swing. */
  strike(x: number, y: number): void {
    this.gap = Math.min(1, this.t);
    this.t = 0;
    const c = Math.cos(STRUCK);
    const s = Math.sin(STRUCK);
    const hx = HEAD.x * c - HEAD.y * s;
    const hy = HEAD.x * s + HEAD.y * c;
    this.img.setPosition(x - hx, y - hy);
    for (const g of this.ghosts) g.setPosition(this.img.x, this.img.y);
  }

  update(dt: number): void {
    this.t += dt;
    this.idle += dt;
    const t = this.t;
    let r: number;
    if (t < DOWN) r = RAISED + (STRUCK - RAISED) * (t / DOWN) ** 2;
    else if (t < DOWN + UP) r = STRUCK + (RAISED - STRUCK) * (1 - (1 - (t - DOWN) / UP) ** 2);
    else r = RAISED + Math.sin(this.idle * 2.2) * 0.04;
    this.img.setRotation(r);
    // flurry: taps faster than FLURRY_GAP leave motion ghosts
    const flurry = this.gap < FLURRY_GAP && t < 0.25;
    this.ghosts.forEach((g, i) => {
      g.setVisible(flurry);
      if (!flurry) return;
      g.setRotation(r - (i + 1) * 0.35);
      g.setAlpha(0.32 - i * 0.14);
    });
    // drift back to the resting spot after a pause
    if (t > 2) {
      this.img.x += (this.rest.x - this.img.x) * Math.min(1, dt * 4);
      this.img.y += (this.rest.y - this.img.y) * Math.min(1, dt * 4);
    }
  }
}

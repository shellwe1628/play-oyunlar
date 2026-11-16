/**
 * The CCTV monitor. Rooms live off-screen at world x = WORLD_X and are shown through a second
 * camera whose viewport is the monitor rectangle, so oversized or moved objects are clipped by
 * the screen edge like a real feed. Draws sim state only; holds no rules.
 */
import { label } from '@oyun/core';
import type Phaser from 'phaser';
import type { ShiftSim } from '../sim/shift';
import { STATION, VIEW, type RoomStyle } from '../sim/station';
import { FEED, PALETTE } from '../textures';
import { drawIntruder, drawObject, drawRoom } from './art';

export const WORLD_X = 4000;

interface ObjView {
  g: Phaser.GameObjects.Graphics;
  copy: Phaser.GameObjects.Graphics;
  color: number;
  on: boolean;
}

export class Feed {
  readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly rooms: Phaser.GameObjects.Container[] = [];
  private readonly views: ObjView[][] = [];
  private readonly ghosts: Phaser.GameObjects.Graphics[][] = [];
  private readonly staticImg: Phaser.GameObjects.TileSprite;
  private readonly bracket: Phaser.GameObjects.Graphics;
  private readonly camLabel: Phaser.GameObjects.Text;
  private readonly stamp: Phaser.GameObjects.Text;
  private readonly blindText: Phaser.GameObjects.Text;
  private readonly rec: Phaser.GameObjects.Image;
  private version = -1;
  private flickerUntil = 0;
  private shown = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    private readonly t: (key: string, p?: Record<string, string | number>) => string,
  ) {
    const s = scene;
    this.cam = s.cameras.add(x, y, FEED, FEED).setScroll(WORLD_X, 0).setBackgroundColor(PALETTE.night);
    STATION.forEach((def, i) => {
      const room = s.add.container(WORLD_X, 0).setVisible(false);
      const bg = s.add.graphics();
      drawRoom(bg, def.style);
      room.add(bg);
      this.views[i] = def.objects.map((o) => {
        const g = s.add.graphics();
        const copy = s.add.graphics().setVisible(false);
        drawObject(g, o.kind, o.w, o.h, o.color, o.on ?? false);
        drawObject(copy, o.kind, o.w, o.h, o.color, o.on ?? false);
        g.setPosition(o.x, o.y);
        room.add([g, copy]);
        return { g, copy, color: o.color, on: o.on ?? false };
      });
      this.ghosts[i] = def.intruders.map((spot) => {
        const g = s.add.graphics().setPosition(spot.x, spot.y).setVisible(false);
        drawIntruder(g, spot.kind, spot.w, spot.h);
        room.add(g);
        return g;
      });
      this.rooms.push(room);
    });
    // Overlay, above every room.
    const o = (obj: Phaser.GameObjects.GameObject & { setDepth(d: number): unknown }, d: number): void => void obj.setDepth(d);
    this.bracket = s.add.graphics().setPosition(WORLD_X, 0);
    o(this.bracket, 5);
    o(s.add.image(WORLD_X, 0, 'scanlines').setOrigin(0).setAlpha(0.9), 6);
    o(s.add.image(WORLD_X, 0, 'vignette').setOrigin(0), 6);
    this.staticImg = s.add.tileSprite(WORLD_X, 0, FEED, FEED, 'static').setOrigin(0).setAlpha(0);
    o(this.staticImg, 7);
    const strip = s.add.graphics().setPosition(WORLD_X, 0);
    strip.fillStyle(0x000000, 0.45).fillRect(0, 0, FEED, 56);
    o(strip, 8);
    this.camLabel = label(s, WORLD_X + 52, 28, '', { size: 32, color: PALETTE.text }).setOrigin(0, 0.5);
    o(this.camLabel, 9);
    this.stamp = label(s, WORLD_X + FEED - 16, 28, '', { size: 32, color: PALETTE.text }).setOrigin(1, 0.5);
    o(this.stamp, 9);
    this.rec = s.add.image(WORLD_X + 26, 28, 'rec-dot');
    o(this.rec, 9);
    s.tweens.add({ targets: this.rec, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
    this.blindText = label(s, WORLD_X + FEED / 2, FEED / 2, '', { size: 48, color: PALETTE.night }).setVisible(false);
    this.blindText.setBackgroundColor('#f2f4ffdd').setPadding(24, 12, 24, 12);
    o(this.blindText, 10);
  }

  /** Feed-world position of a view point (for particles and float text inside the monitor). */
  world(vx: number, vy: number): { x: number; y: number } {
    return { x: WORLD_X + vx, y: vy };
  }

  /** Screen point → view point, or null when outside the monitor. */
  toView(px: number, py: number): { x: number; y: number } | null {
    const vx = px - this.x;
    const vy = py - this.y;
    return vx >= 0 && vy >= 0 && vx <= VIEW && vy <= VIEW ? { x: vx, y: vy } : null;
  }

  flicker(ms = 160): void {
    this.flickerUntil = this.scene.time.now + ms;
  }

  select(rect: { x: number; y: number; w: number; h: number } | null): void {
    const g = this.bracket;
    g.clear();
    if (!rect) return;
    const pad = 10;
    const x0 = rect.x - rect.w / 2 - pad;
    const y0 = rect.y - rect.h / 2 - pad;
    const x1 = rect.x + rect.w / 2 + pad;
    const y1 = rect.y + rect.h / 2 + pad;
    const L = Math.min(26, (x1 - x0) / 3, (y1 - y0) / 3);
    for (const [c, w] of [[0x000000, 10], [PALETTE.lamp, 5]] as const) {
      g.lineStyle(w, c, c === 0 ? 0.6 : 1);
      g.lineBetween(x0, y0, x0 + L, y0).lineBetween(x0, y0, x0, y0 + L);
      g.lineBetween(x1, y0, x1 - L, y0).lineBetween(x1, y0, x1, y0 + L);
      g.lineBetween(x0, y1, x0 + L, y1).lineBetween(x0, y1, x0, y1 - L);
      g.lineBetween(x1, y1, x1 - L, y1).lineBetween(x1, y1, x1, y1 - L);
    }
    this.scene.tweens.killTweensOf(g);
    g.setAlpha(1);
    this.scene.tweens.add({ targets: g, alpha: 0.55, duration: 380, yoyo: true, repeat: -1 });
  }

  /** Redraw from sim state; cheap when nothing changed. */
  sync(sim: ShiftSim, timeLabel: string): void {
    if (this.shown !== sim.camera) {
      this.rooms.forEach((r, i) => r.setVisible(i === sim.camera));
      this.shown = sim.camera;
      const n = sim.camera + 1;
      this.camLabel.setText(`${this.t('cam.tag', { n })} · ${this.t(`cam.${STATION[sim.camera]!.id}`)}`);
    }
    this.stamp.setText(timeLabel);
    if (this.version !== sim.version) {
      this.version = sim.version;
      STATION.forEach((def, c) => {
        sim.objects(c).forEach((o, i) => {
          const v = this.views[c]![i]!;
          if (v.color !== o.color || v.on !== o.on) {
            drawObject(v.g, o.kind, o.w, o.h, o.color, o.on);
            drawObject(v.copy, o.kind, o.w, o.h, o.color, o.on);
            v.color = o.color;
            v.on = o.on;
          }
          v.g.setPosition(o.x, o.y).setScale(o.scale).setVisible(o.visible);
          v.copy.setVisible(o.copy !== null);
          if (o.copy) v.copy.setPosition(o.copy.x, o.copy.y);
        });
        sim.intruders(c).forEach((s, i) => this.ghosts[c]![i]!.setVisible(s.visible));
        void def;
      });
    }
    // Static: strong while blind, a short burst on camera switch.
    const blind = sim.staticLeft > 0;
    const flick = this.scene.time.now < this.flickerUntil;
    const alpha = blind ? 0.94 : flick ? 0.8 : sim.over ? 0 : 0.05;
    this.staticImg.setAlpha(alpha);
    this.staticImg.tilePositionX = Math.random() * 160;
    this.staticImg.tilePositionY = Math.random() * 160;
    this.blindText.setVisible(blind);
    if (blind) this.blindText.setText(`${this.t('game.blind')} ${Math.ceil(sim.staticLeft)}`);
  }

  /** Full-strength static (lose). */
  blast(): void {
    this.staticImg.setAlpha(1);
    this.flickerUntil = this.scene.time.now + 100000;
  }
}

/** Small room glyphs for the camera tabs and the logbook. */
export function drawRoomIcon(g: Phaser.GameObjects.Graphics, style: RoomStyle, x: number, y: number, s: number, c: number): void {
  const u = s / 2;
  g.fillStyle(c, 1);
  g.lineStyle(Math.max(3, s * 0.09), c, 1);
  switch (style) {
    case 'lamp':
      g.fillTriangle(x - u * 0.6, y - u * 0.55, x + u * 0.6, y - u * 0.55, x, y - u);
      g.fillRoundedRect(x - u * 0.45, y - u * 0.5, u * 0.9, u * 0.9, 6);
      g.fillRect(x - u * 0.7, y + u * 0.5, u * 1.4, u * 0.35);
      break;
    case 'stairs':
      for (let i = 0; i < 4; i++) g.fillRect(x - u + i * u * 0.5, y + u * 0.5 - i * u * 0.45, u * 0.55, u * 0.45 * (i + 1));
      break;
    case 'dock':
      g.fillCircle(x + u * 0.45, y - u * 0.45, u * 0.3);
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.arc(x - u * 0.5, y + i * u * 0.45, u * 0.35, Math.PI, 0);
        g.arc(x + u * 0.2, y + i * u * 0.45, u * 0.35, Math.PI, 0);
        g.strokePath();
      }
      break;
    case 'kitchen':
      g.fillEllipse(x, y + u * 0.2, u * 1.4, u * 1.1);
      g.fillTriangle(x + u * 0.5, y + u * 0.1, x + u, y - u * 0.4, x + u * 0.55, y + u * 0.45);
      g.lineBetween(x - u * 0.4, y - u * 0.4, x + u * 0.4, y - u * 0.4);
      g.fillCircle(x, y - u * 0.55, u * 0.14);
      break;
  }
}

/**
 * Code-drawn art for the camera views. Every object is drawn centred on (0,0) at its unscaled
 * size; the feed positions and scales the Graphics. `c` is the object's colour (what a recolour
 * changes; for lights it is the light colour), `on` its state.
 */
import type Phaser from 'phaser';
import type { AnomalyType, IntruderKind, ObjectKind, RoomStyle } from '../sim/station';
import { VIEW } from '../sim/station';
import { PALETTE } from '../textures';

type G = Phaser.GameObjects.Graphics;

/** Point lists for fillPoints (Phaser accepts plain {x, y} at runtime; its typing wants Vector2). */
const pts = (p: { x: number; y: number }[]): Phaser.Math.Vector2[] => p as Phaser.Math.Vector2[];

/** Multiply a colour's channels (f < 1 darker, f > 1 lighter). */
export function shade(c: number, f: number): number {
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f + (f > 1 ? (f - 1) * 40 : 0))));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

const OUT = 0x0a0c18;

function glow(g: G, x: number, y: number, r: number, c: number, a = 0.18): void {
  for (let i = 4; i >= 1; i--) g.fillStyle(c, a / i).fillCircle(x, y, (r * (i + 1)) / 3);
}

function box(g: G, x: number, y: number, w: number, h: number, c: number, r = 4, outline = true): void {
  if (outline) g.fillStyle(OUT, 0.9).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, r + 2);
  g.fillStyle(c, 1).fillRoundedRect(x, y, w, h, r);
}

// ------------------------------------------------------------------ rooms

function stars(g: G, x0: number, y0: number, w: number, h: number, n: number, seed: number): void {
  let s = seed;
  const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) g.fillStyle(0xdfe6ff, 0.35 + r() * 0.5).fillCircle(x0 + r() * w, y0 + r() * h, 1 + r() * 1.6);
}

export function drawRoom(g: G, style: RoomStyle): void {
  g.clear();
  const V = VIEW;
  switch (style) {
    case 'lamp': {
      // Glass cupola: night sky behind iron mullions, the lens pedestal on a round floor.
      g.fillStyle(0x0b1330, 1).fillRect(0, 0, V, 400);
      stars(g, 0, 0, V, 380, 60, 7);
      g.fillStyle(0x1d2950, 0.6).fillRect(0, 300, V, 100);
      g.fillStyle(0x18243f, 1).fillRect(0, 380, V, 30);
      for (let x = 0; x <= V; x += 160) g.fillStyle(0x2a3350, 1).fillRect(x - 7, 0, 14, 400);
      g.fillStyle(0x2a3350, 1).fillRect(0, 0, V, 22);
      g.fillStyle(0x221d33, 1).fillRect(0, 400, V, 240);
      g.lineStyle(2, 0x2e2844, 1);
      for (let y = 430; y < V; y += 34) g.lineBetween(0, y, V, y);
      // railing round the gallery
      g.lineStyle(6, 0x3a4460, 1).lineBetween(0, 372, V, 372);
      for (let x = 20; x < V; x += 40) g.lineStyle(3, 0x3a4460, 1).lineBetween(x, 372, x, 400);
      // pedestal under the lens
      g.fillStyle(0x3b4048, 1).fillRect(270, 365, 100, 50);
      g.fillStyle(0x2c3038, 1).fillRect(250, 410, 140, 18);
      break;
    }
    case 'stairs': {
      // Brick shaft with a staircase climbing left → right.
      g.fillStyle(0x17302f, 1).fillRect(0, 0, V, V);
      g.lineStyle(2, 0x0f2322, 1);
      for (let y = 0, row = 0; y < V; y += 28, row++) {
        g.lineBetween(0, y, V, y);
        for (let x = row % 2 ? 0 : 30; x < V; x += 60) g.lineBetween(x, y, x, y + 28);
      }
      // a column of shadow at the stairwell core
      g.fillStyle(0x0c1a1a, 0.5).fillRect(250, 0, 180, V);
      // steps
      const stepW = 64;
      const stepH = 34;
      for (let i = 0; i < 10; i++) {
        const x = 20 + i * stepW * 0.62;
        const y = 640 - i * stepH - stepH;
        g.fillStyle(0x4a3a2a, 1).fillRect(x, y, stepW * 1.4, stepH);
        g.fillStyle(0x6b5338, 1).fillRect(x, y, stepW * 1.4, 7);
      }
      // handrail
      g.lineStyle(7, 0x8a6a3f, 1).lineBetween(30, 560, 440, 250);
      for (let i = 0; i < 8; i++) {
        const x = 40 + i * 52;
        const y = 552 - i * 39;
        g.lineStyle(3, 0x6b5338, 1).lineBetween(x, y, x, y + 60);
      }
      g.fillStyle(0x10201f, 1).fillRect(0, 620, V, 20);
      break;
    }
    case 'dock': {
      // Open air: sky, moonlit sea, pier planks in front.
      for (let i = 0; i < 10; i++) g.fillStyle(i < 5 ? 0x0a1430 : 0x13214a, 1).fillRect(0, i * 26, V, 26);
      g.fillStyle(0x182a55, 1).fillRect(0, 210, V, 50);
      stars(g, 0, 0, V, 220, 70, 23);
      g.fillStyle(0x0d3442, 1).fillRect(0, 258, V, 172);
      g.lineStyle(2, 0x2a5a66, 0.8);
      for (let y = 272; y < 430; y += 18) for (let x = (y * 7) % 60; x < V; x += 90) g.lineBetween(x, y, x + 34, y);
      // moon path on the water
      g.fillStyle(0xf2ecd0, 0.08).fillRect(470, 262, 60, 168);
      // distant headland
      g.fillStyle(0x0a1a26, 1).fillTriangle(0, 260, 0, 228, 90, 260);
      g.fillStyle(0x0a1a26, 1).fillTriangle(560, 260, 640, 236, 640, 260);
      // pier
      g.fillStyle(0x3d3022, 1).fillRect(0, 430, V, 210);
      g.lineStyle(3, 0x2a2018, 1);
      for (let y = 430; y < V; y += 30) g.lineBetween(0, y, V, y);
      for (let x = 0, r = 0; x < V; x += 110, r++) g.lineBetween(x + (r % 2) * 50, 430, x + (r % 2) * 50, V);
      g.fillStyle(0x2a2018, 1).fillRect(0, 424, V, 10);
      break;
    }
    case 'kitchen': {
      // Warm room: striped wallpaper, shelf, chequered floor.
      g.fillStyle(0x4a3326, 1).fillRect(0, 0, V, 470);
      for (let x = 0; x < V; x += 48) g.fillStyle(0x553b2c, 1).fillRect(x, 0, 22, 470);
      g.fillStyle(0x3a281e, 1).fillRect(0, 250, V, 8);
      // shelf for the radio
      g.fillStyle(0x6b4a2f, 1).fillRect(30, 362, 150, 12);
      // counter by the stove
      g.fillStyle(0x5a4030, 1).fillRect(440, 350, 200, 10);
      for (let y = 470, r = 0; y < V; y += 34, r++)
        for (let x = (r % 2) * 40; x < V; x += 80) g.fillStyle(0x2e2219, 1).fillRect(x, y, 40, 34);
      g.fillStyle(0x3a2a20, 0.6).fillRect(0, 470, V, 170);
      g.fillStyle(0x2a1e16, 1).fillRect(0, 466, V, 8);
      break;
    }
  }
}

// ------------------------------------------------------------------ objects

export function drawObject(g: G, kind: ObjectKind, w: number, h: number, c: number, on: boolean): void {
  g.clear();
  const hw = w / 2;
  const hh = h / 2;
  switch (kind) {
    case 'lens': {
      if (on) glow(g, 0, -10, w * 0.95, c, 0.3);
      box(g, -hw, -hh, w, h, on ? c : 0x2c3650, 26);
      g.lineStyle(4, on ? shade(c, 0.75) : 0x46506e, 1);
      for (let y = -hh + 24; y < hh - 10; y += 22) g.lineBetween(-hw + 10, y, hw - 10, y);
      g.lineStyle(4, on ? shade(c, 0.6) : 0x3a4460, 1).lineBetween(0, -hh + 8, 0, hh - 8);
      g.fillStyle(on ? 0xffffff : 0x5a6688, on ? 0.75 : 0.5).fillCircle(0, -10, on ? 26 : 16);
      g.fillStyle(0x3b4048, 1).fillRect(-hw + 10, -hh - 10, w - 20, 14);
      break;
    }
    case 'window': {
      box(g, -hw, -hh, w, h, 0x2a2030, 6);
      if (on) {
        g.fillStyle(c, 1).fillRect(-hw + 8, -hh + 8, w - 16, h - 16);
        g.fillStyle(0xdfe6ff, 0.8).fillCircle(-hw * 0.4, -hh * 0.5, 2).fillCircle(hw * 0.35, -hh * 0.1, 2).fillCircle(-hw * 0.1, hh * 0.3, 1.6);
        g.fillStyle(0xdfe6ff, 0.12).fillTriangle(-hw + 8, hh - 8, -hw + 8, -hh * 0.2, hw * 0.2, hh - 8);
        g.lineStyle(5, 0x2a2030, 1).lineBetween(0, -hh, 0, hh).lineBetween(-hw, 0, hw, 0);
      } else {
        // wooden shutters closed
        g.fillStyle(0x6b4a2f, 1).fillRect(-hw + 8, -hh + 8, w - 16, h - 16);
        g.lineStyle(3, 0x4a3320, 1);
        for (let y = -hh + 18; y < hh - 8; y += 12) g.lineBetween(-hw + 10, y, hw - 10, y);
        g.lineStyle(4, 0x2a2030, 1).lineBetween(0, -hh + 8, 0, hh - 8);
      }
      break;
    }
    case 'frame': {
      box(g, -hw, -hh, w, h, 0x8a6a3f, 4);
      g.fillStyle(c, 1).fillRect(-hw + 8, -hh + 8, w - 16, h - 16);
      g.fillStyle(shade(c, 1.5), 1).fillTriangle(-hw + 12, hh - 10, -hw * 0.1, -hh * 0.2, hw * 0.4, hh - 10);
      g.fillStyle(shade(c, 0.6), 1).fillTriangle(0, hh - 10, hw * 0.45, -hh * 0.35, hw - 10, hh - 10);
      break;
    }
    case 'clock': {
      g.fillStyle(OUT, 0.9).fillCircle(0, 0, hw + 3);
      g.fillStyle(0x3b4048, 1).fillCircle(0, 0, hw);
      g.fillStyle(c, 1).fillCircle(0, 0, hw - 6);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillStyle(0x2a2a2a, 1).fillCircle(Math.cos(a) * (hw - 12), Math.sin(a) * (hw - 12), 2);
      }
      g.lineStyle(4, 0x1a1a1a, 1).lineBetween(0, 0, 0, -hw + 14);
      g.lineStyle(4, 0x1a1a1a, 1).lineBetween(0, 0, hw * 0.45, hw * 0.2);
      break;
    }
    case 'wrench': {
      g.fillStyle(OUT, 0.9).fillRoundedRect(-9, -hh * 0.45, 18, hh * 1.45 + 2, 6);
      g.fillStyle(c, 1).fillRoundedRect(-6, -hh * 0.4, 12, hh * 1.4, 5);
      g.fillStyle(OUT, 0.9).fillCircle(0, -hh + 18, 21);
      g.fillStyle(c, 1).fillCircle(0, -hh + 18, 18);
      g.fillStyle(0x221d33, 1).fillRect(-6, -hh - 2, 12, 22);
      g.fillStyle(shade(c, 1.3), 1).fillCircle(0, hh - 8, 5);
      break;
    }
    case 'desk': {
      box(g, -hw, -hh, w, 20, c, 3);
      g.fillStyle(shade(c, 0.7), 1).fillRect(-hw + 10, -hh + 20, 16, h - 20).fillRect(hw - 26, -hh + 20, 16, h - 20);
      g.fillStyle(shade(c, 0.85), 1).fillRect(hw - 90, -hh + 20, 64, 34);
      g.fillStyle(0xd9c79a, 1).fillCircle(hw - 58, -hh + 37, 4);
      break;
    }
    case 'book': {
      box(g, -hw, -hh, w, h, c, 3);
      g.fillStyle(0xe8e0c8, 1).fillRect(-hw + 4, hh - 8, w - 8, 5);
      g.fillStyle(shade(c, 1.4), 1).fillRect(-hw + 10, -hh + 6, 6, h - 14);
      break;
    }
    case 'oilcan': {
      g.lineStyle(5, OUT, 0.9).lineBetween(hw * 0.2, -hh * 0.3, hw + 4, -hh - 2);
      g.lineStyle(3, shade(c, 1.3), 1).lineBetween(hw * 0.2, -hh * 0.3, hw + 2, -hh);
      box(g, -hw * 0.8, -hh * 0.4, w * 0.8, h * 0.9, c, 6);
      g.fillStyle(shade(c, 0.7), 1).fillRect(-hw * 0.5, -hh * 0.6, w * 0.3, 10);
      g.lineStyle(4, shade(c, 0.6), 1);
      g.beginPath();
      g.arc(-hw * 0.4, -hh * 0.1, 16, Math.PI, Math.PI * 1.9);
      g.strokePath();
      break;
    }
    case 'chair': {
      g.fillStyle(OUT, 0.9).fillRect(-hw - 3, -hh - 3, 18, h * 0.62 + 6);
      g.fillStyle(c, 1).fillRect(-hw, -hh, 12, h * 0.62);
      box(g, -hw, -hh + h * 0.5, w, 14, c, 3);
      g.fillStyle(shade(c, 0.7), 1).fillRect(-hw + 2, -hh + h * 0.5 + 14, 9, h * 0.5 - 14).fillRect(hw - 11, -hh + h * 0.5 + 14, 9, h * 0.5 - 14);
      g.fillStyle(shade(c, 0.8), 1).fillRect(-hw, -hh + 18, 12, 8).fillRect(-hw, -hh + 40, 12, 8);
      break;
    }
    case 'hatch': {
      if (on) {
        g.fillStyle(0x020205, 1).fillRect(-hw, -hh + 10, w, h - 10);
        g.fillStyle(0xffd36b, 0.18).fillRect(-hw + 10, -hh + 14, w - 20, h - 20);
        box(g, -hw, -hh - 40, w, 34, shade(c, 1.2), 3);
        g.lineStyle(2, shade(c, 0.6), 1).lineBetween(-hw + w / 3, -hh - 40, -hw + w / 3, -hh - 6).lineBetween(-hw + (2 * w) / 3, -hh - 40, -hw + (2 * w) / 3, -hh - 6);
      } else {
        box(g, -hw, -hh, w, h, c, 3);
        g.lineStyle(2, shade(c, 0.6), 1).lineBetween(-hw + w / 3, -hh, -hw + w / 3, hh).lineBetween(-hw + (2 * w) / 3, -hh, -hw + (2 * w) / 3, hh);
        g.lineStyle(3, 0x9aa3ad, 1).strokeCircle(0, 0, 7);
      }
      break;
    }
    case 'crate': {
      box(g, -hw, -hh, w, h, c, 3);
      g.lineStyle(5, shade(c, 0.65), 1).strokeRect(-hw + 6, -hh + 6, w - 12, h - 12);
      g.lineStyle(5, shade(c, 0.65), 1).lineBetween(-hw + 8, hh - 8, hw - 8, -hh + 8);
      g.lineStyle(2, shade(c, 1.25), 1).lineBetween(-hw + 6, -hh + 3, hw - 6, -hh + 3);
      break;
    }
    case 'bucket': {
      g.lineStyle(4, shade(c, 0.6), 1);
      g.beginPath();
      g.arc(0, -hh * 0.4, hw * 0.75, Math.PI, 0);
      g.strokePath();
      g.fillStyle(OUT, 0.9).fillPoints(pts([{ x: -hw - 3, y: -hh * 0.4 - 3 }, { x: hw + 3, y: -hh * 0.4 - 3 }, { x: hw * 0.7 + 3, y: hh + 3 }, { x: -hw * 0.7 - 3, y: hh + 3 }]), true);
      g.fillStyle(c, 1).fillPoints(pts([{ x: -hw, y: -hh * 0.4 }, { x: hw, y: -hh * 0.4 }, { x: hw * 0.7, y: hh }, { x: -hw * 0.7, y: hh }]), true);
      g.fillStyle(shade(c, 1.35), 1).fillEllipse(0, -hh * 0.4, w, 12);
      g.fillStyle(shade(c, 0.7), 1).fillRect(-hw * 0.82, 0, w * 0.82, 5);
      break;
    }
    case 'porthole': {
      g.fillStyle(OUT, 0.9).fillCircle(0, 0, hw + 3);
      g.fillStyle(0xb08a4a, 1).fillCircle(0, 0, hw);
      if (on) {
        g.fillStyle(c, 1).fillCircle(0, 0, hw - 12);
        g.fillStyle(0xf2ecd0, 0.9).fillCircle(hw * 0.3, -hw * 0.25, 9);
        g.fillStyle(0x0d3442, 1).fillRect(-hw + 14, hw * 0.25, w - 28, 10);
      } else {
        g.fillStyle(0x3b4048, 1).fillCircle(0, 0, hw - 12);
        g.lineStyle(4, 0x2a2e36, 1).lineBetween(-hw + 16, 0, hw - 16, 0);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillStyle(0x6b5338, 1).fillCircle(Math.cos(a) * (hw - 6), Math.sin(a) * (hw - 6), 3);
      }
      break;
    }
    case 'sconce': {
      g.fillStyle(0x3b4048, 1).fillRoundedRect(-10, -hh, 20, h, 6);
      g.fillStyle(0x3b4048, 1).fillRect(-hw, hh - 14, w, 10);
      if (on) glow(g, 0, -4, 44, c, 0.32);
      g.fillStyle(OUT, 0.9).fillEllipse(0, -4, w * 0.7 + 6, h * 0.55 + 6);
      g.fillStyle(on ? c : 0x50566a, 1).fillEllipse(0, -4, w * 0.7, h * 0.55);
      if (on) g.fillStyle(0xffffff, 0.7).fillEllipse(0, -6, w * 0.3, h * 0.25);
      break;
    }
    case 'coat': {
      g.fillStyle(0x9aa3ad, 1).fillRect(-4, -hh, 8, 12);
      g.fillStyle(OUT, 0.9).fillPoints(pts([{ x: -hw * 0.55 - 3, y: -hh + 6 }, { x: hw * 0.55 + 3, y: -hh + 6 }, { x: hw + 3, y: hh + 3 }, { x: -hw - 3, y: hh + 3 }]), true);
      g.fillStyle(c, 1).fillPoints(pts([{ x: -hw * 0.55, y: -hh + 10 }, { x: hw * 0.55, y: -hh + 10 }, { x: hw, y: hh }, { x: -hw, y: hh }]), true);
      g.fillStyle(shade(c, 0.75), 1).fillEllipse(0, -hh + 22, w * 0.5, 30);
      g.lineStyle(3, shade(c, 0.6), 1).lineBetween(0, -hh + 36, 0, hh - 4);
      g.fillStyle(shade(c, 0.6), 1).fillCircle(-6, -hh + 60, 3).fillCircle(-6, -hh + 90, 3).fillCircle(-6, -hh + 120, 3);
      break;
    }
    case 'boots': {
      for (const sx of [-1, 1]) {
        const x0 = sx < 0 ? -hw : 4;
        const bw = hw - 4;
        box(g, x0, -hh, bw * 0.6, h - 12, c, 4);
        box(g, x0, hh - 18, bw, 18, c, 6);
        g.fillStyle(shade(c, 0.6), 1).fillRect(x0, hh - 6, bw, 6);
      }
      break;
    }
    case 'door': {
      g.fillStyle(0x2a2030, 1).fillRect(-hw - 6, -hh - 6, w + 12, h + 6);
      if (on) {
        g.fillStyle(0x020205, 1).fillRect(-hw, -hh, w, h);
        g.fillStyle(0x9bb4d6, 0.12).fillTriangle(-hw, hh, -hw + 30, -hh + 30, hw, hh);
        g.fillStyle(c, 1).fillPoints(pts([{ x: -hw, y: -hh }, { x: -hw + 28, y: -hh + 16 }, { x: -hw + 28, y: hh + 10 }, { x: -hw, y: hh }]), true);
      } else {
        g.fillStyle(c, 1).fillRect(-hw, -hh, w, h);
        g.lineStyle(4, shade(c, 0.7), 1).strokeRect(-hw + 14, -hh + 16, w - 28, h * 0.38).strokeRect(-hw + 14, -hh + h * 0.5, w - 28, h * 0.42);
        g.fillStyle(0xd9b45a, 1).fillCircle(hw - 18, 8, 6);
      }
      break;
    }
    case 'umbrella': {
      g.lineStyle(4, 0x2a2a2a, 1).lineBetween(0, -hh, 0, hh - 14);
      g.lineStyle(5, 0x2a2a2a, 1);
      g.beginPath();
      g.arc(-8, hh - 14, 8, 0, Math.PI);
      g.strokePath();
      g.fillStyle(OUT, 0.9).fillTriangle(0, -hh - 4, -hw - 3, hh * 0.45 + 3, hw + 3, hh * 0.45 + 3);
      g.fillStyle(c, 1).fillTriangle(0, -hh, -hw, hh * 0.45, hw, hh * 0.45);
      g.lineStyle(2, shade(c, 0.6), 1).lineBetween(0, -hh, -hw * 0.3, hh * 0.45).lineBetween(0, -hh, hw * 0.3, hh * 0.45);
      break;
    }
    case 'handlantern': {
      g.lineStyle(4, 0x3b4048, 1).strokeCircle(0, -hh + 8, 9);
      if (on) glow(g, 0, 6, 46, c, 0.34);
      g.fillStyle(0x3b4048, 1).fillRect(-hw * 0.8, -hh + 14, hw * 0.8 * 2, 10).fillRect(-hw * 0.8, hh - 12, hw * 0.8 * 2, 12);
      g.fillStyle(on ? c : 0x3a4052, 1).fillRect(-hw * 0.6, -hh + 24, hw * 0.6 * 2, h - 36);
      g.lineStyle(3, 0x3b4048, 1).lineBetween(-hw * 0.6, -hh + 24, -hw * 0.6, hh - 12).lineBetween(hw * 0.6, -hh + 24, hw * 0.6, hh - 12);
      if (on) g.fillStyle(0xffffff, 0.8).fillEllipse(0, 4, 10, 16);
      break;
    }
    case 'rope': {
      g.fillStyle(OUT, 0.8).fillEllipse(0, 4, w + 6, h + 4);
      for (let i = 0; i < 4; i++) {
        g.lineStyle(7, i % 2 ? shade(c, 0.75) : c, 1).strokeEllipse(0, 4 - i * 4, w - i * 20, h - i * 10);
      }
      break;
    }
    case 'toolbox': {
      g.lineStyle(5, shade(c, 0.6), 1).strokeRect(-hw * 0.35, -hh - 6, w * 0.35 * 2, 16);
      box(g, -hw, -hh + 8, w, h - 8, c, 5);
      g.fillStyle(shade(c, 0.7), 1).fillRect(-hw, -hh + 20, w, 6);
      g.fillStyle(0xd9c79a, 1).fillRect(-8, -hh + 18, 16, 10);
      break;
    }
    case 'moon': {
      glow(g, 0, 0, w * 0.9, c, 0.16);
      g.fillStyle(c, 1).fillCircle(0, 0, hw);
      g.fillStyle(shade(c, 0.82), 1).fillCircle(-hw * 0.3, -hw * 0.2, hw * 0.22).fillCircle(hw * 0.35, hw * 0.25, hw * 0.16).fillCircle(hw * 0.1, -hw * 0.5, hw * 0.1);
      break;
    }
    case 'shiplight': {
      g.fillStyle(0x070d1a, 1).fillPoints(pts([{ x: -hw, y: 2 }, { x: hw, y: 2 }, { x: hw * 0.7, y: hh }, { x: -hw * 0.8, y: hh }]), true);
      g.fillStyle(0x070d1a, 1).fillRect(-hw * 0.3, -hh * 0.4, w * 0.35, hh * 0.5 + 2);
      g.lineStyle(2, 0x070d1a, 1).lineBetween(hw * 0.25, 2, hw * 0.25, -hh - 4);
      if (on) {
        glow(g, hw * 0.25, -hh, 22, c, 0.5);
        g.fillStyle(c, 1).fillCircle(hw * 0.25, -hh, 4);
      }
      break;
    }
    case 'buoy': {
      if (on) glow(g, 0, -hh + 6, 28, 0xffd36b, 0.45);
      g.fillStyle(0xffd36b, on ? 1 : 0).fillCircle(0, -hh + 6, 5);
      g.fillStyle(0x3b4048, 1).fillRect(-3, -hh + 8, 6, 14);
      g.fillStyle(OUT, 0.9).fillTriangle(0, -hh + 16, -hw - 3, hh * 0.55 + 3, hw + 3, hh * 0.55 + 3);
      g.fillStyle(c, 1).fillTriangle(0, -hh + 20, -hw, hh * 0.55, hw, hh * 0.55);
      g.fillStyle(0xe8e0c8, 1).fillRect(-hw * 0.5, 0, w * 0.5, 8);
      g.fillStyle(0x0d3442, 0.9).fillRect(-hw - 4, hh * 0.5, w + 8, hh * 0.5);
      g.lineStyle(2, 0x2a5a66, 1).lineBetween(-hw - 6, hh * 0.55, hw + 6, hh * 0.55);
      break;
    }
    case 'boat': {
      g.lineStyle(3, 0x1a1a22, 1).lineBetween(-hw * 0.1, -hh - 30, -hw * 0.1, 0);
      g.fillStyle(0xd9d2b8, 0.9).fillTriangle(-hw * 0.1 + 3, -hh - 26, -hw * 0.1 + 3, -4, hw * 0.45, -4);
      g.fillStyle(OUT, 0.9).fillPoints(pts([{ x: -hw - 3, y: -6 }, { x: hw + 3, y: -6 }, { x: hw * 0.75 + 3, y: hh + 3 }, { x: -hw * 0.8 - 3, y: hh + 3 }]), true);
      g.fillStyle(c, 1).fillPoints(pts([{ x: -hw, y: -3 }, { x: hw, y: -3 }, { x: hw * 0.75, y: hh }, { x: -hw * 0.8, y: hh }]), true);
      g.fillStyle(shade(c, 0.6), 1).fillRect(-hw * 0.85, 6, w * 0.82, 6);
      g.fillStyle(shade(c, 1.3), 1).fillRect(-hw * 0.7, -hh + 6, w * 0.4, hh - 8);
      break;
    }
    case 'barrel': {
      g.fillStyle(OUT, 0.9).fillRoundedRect(-hw - 3, -hh - 3, w + 6, h + 6, 18);
      g.fillStyle(c, 1).fillRoundedRect(-hw, -hh, w, h, 16);
      g.fillStyle(shade(c, 0.55), 1).fillRect(-hw, -hh * 0.6, w, 7).fillRect(-hw, hh * 0.5, w, 7);
      g.lineStyle(2, shade(c, 0.75), 1).lineBetween(-hw * 0.35, -hh + 4, -hw * 0.35, hh - 4).lineBetween(hw * 0.35, -hh + 4, hw * 0.35, hh - 4);
      break;
    }
    case 'postlamp': {
      g.fillStyle(0x2a2e36, 1).fillRect(-6, -hh + 30, 12, h - 30);
      g.fillStyle(0x2a2e36, 1).fillRect(-14, hh - 12, 28, 12);
      if (on) {
        g.fillStyle(c, 0.1).fillTriangle(0, -hh + 18, -hw * 3, hh, hw * 3, hh);
        glow(g, 0, -hh + 18, 40, c, 0.4);
      }
      g.fillStyle(0x2a2e36, 1).fillTriangle(-hw * 0.6, -hh + 6, hw * 0.6, -hh + 6, 0, -hh - 6);
      g.fillStyle(on ? c : 0x50566a, 1).fillRect(-hw * 0.4, -hh + 6, hw * 0.4 * 2, 22);
      g.fillStyle(0x2a2e36, 1).fillRect(-hw * 0.5, -hh + 28, hw * 0.5 * 2, 5);
      break;
    }
    case 'bollard': {
      g.fillStyle(OUT, 0.9).fillRoundedRect(-hw * 0.6 - 3, -hh * 0.4, hw * 0.6 * 2 + 6, h * 0.7 + 3, 4);
      g.fillStyle(c, 1).fillRoundedRect(-hw * 0.6, -hh * 0.4, hw * 0.6 * 2, h * 0.7, 4);
      g.fillStyle(OUT, 0.9).fillEllipse(0, -hh * 0.45, w + 6, 22);
      g.fillStyle(shade(c, 1.4), 1).fillEllipse(0, -hh * 0.45, w, 16);
      break;
    }
    case 'lifering': {
      g.lineStyle(18, OUT, 0.9).strokeCircle(0, 0, hw - 8);
      g.lineStyle(14, c, 1).strokeCircle(0, 0, hw - 8);
      g.lineStyle(14, 0x3f8f8a, 1);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(0, 0, hw - 8, (i * Math.PI) / 2 - 0.25, (i * Math.PI) / 2 + 0.25);
        g.strokePath();
      }
      break;
    }
    case 'gull': {
      g.fillStyle(OUT, 0.9).fillEllipse(0, 4, w * 0.7 + 6, h * 0.5 + 6);
      g.fillStyle(c, 1).fillEllipse(0, 4, w * 0.7, h * 0.5);
      g.fillStyle(c, 1).fillCircle(hw * 0.45, -hh * 0.3, 9);
      g.fillStyle(0x1a1a1a, 1).fillCircle(hw * 0.5, -hh * 0.35, 2);
      g.fillStyle(0xe0a030, 1).fillTriangle(hw * 0.62, -hh * 0.32, hw * 0.62, -hh * 0.12, hw, -hh * 0.2);
      g.fillStyle(0x7a828c, 1).fillTriangle(-hw, -2, hw * 0.2, -2, -hw * 0.3, hh * 0.4);
      g.lineStyle(3, 0xe0a030, 1).lineBetween(-4, hh * 0.5, -4, hh).lineBetween(6, hh * 0.5, 6, hh);
      break;
    }
    case 'net': {
      g.fillStyle(OUT, 0.6).fillEllipse(0, 0, w + 6, h + 6);
      g.fillStyle(shade(c, 0.6), 1).fillEllipse(0, 0, w, h);
      g.lineStyle(2, c, 1);
      for (let i = -3; i <= 3; i++) g.lineBetween(-hw * 0.9 + (i + 3) * (w / 7), -hh * 0.8, -hw * 0.9 + (i + 3) * (w / 7) + 18, hh * 0.8);
      for (let i = -3; i <= 3; i++) g.lineBetween(-hw * 0.9 + (i + 3) * (w / 7) + 18, -hh * 0.8, -hw * 0.9 + (i + 3) * (w / 7), hh * 0.8);
      g.fillStyle(0xd98c3a, 1).fillCircle(-hw * 0.6, -hh * 0.4, 6).fillCircle(hw * 0.5, hh * 0.2, 6);
      break;
    }
    case 'ceilinglamp': {
      g.lineStyle(3, 0x2a2a2a, 1).lineBetween(0, -hh - 40, 0, -hh + 10);
      if (on) {
        g.fillStyle(c, 0.08).fillTriangle(-hw * 0.5, hh - 10, -hw * 3.5, hh + 380, hw * 3.5, hh + 380);
        glow(g, 0, hh - 12, 54, c, 0.36);
      }
      g.fillStyle(OUT, 0.9).fillTriangle(0, -hh + 4, -hw - 4, hh - 8, hw + 4, hh - 8);
      g.fillStyle(0x3f7f7a, 1).fillTriangle(0, -hh + 10, -hw, hh - 10, hw, hh - 10);
      g.fillStyle(on ? c : 0x50566a, 1).fillCircle(0, hh - 10, 14);
      if (on) g.fillStyle(0xffffff, 0.7).fillCircle(0, hh - 10, 6);
      break;
    }
    case 'stove': {
      box(g, -hw, -hh + 20, w, h - 20, c, 6);
      g.fillStyle(shade(c, 0.6), 1).fillRect(hw * 0.5, -hh - 40, w * 0.2, 64);
      g.fillStyle(shade(c, 1.35), 1).fillRect(-hw, -hh + 20, w, 12);
      g.fillStyle(0x1a1c22, 1).fillRoundedRect(-hw * 0.7, -hh + 60, hw * 0.7 * 2, h * 0.38, 8);
      if (on) {
        glow(g, 0, -hh + 60 + h * 0.19, 70, 0xff9a3a, 0.34);
        g.fillStyle(0xff9a3a, 1).fillRoundedRect(-hw * 0.6, -hh + 68, hw * 0.6 * 2, h * 0.3, 6);
        g.fillStyle(0xffd36b, 1).fillTriangle(-hw * 0.35, -hh + 68 + h * 0.3, -hw * 0.15, -hh + 78, 0, -hh + 68 + h * 0.3);
        g.fillStyle(0xffd36b, 1).fillTriangle(0, -hh + 68 + h * 0.3, hw * 0.2, -hh + 84, hw * 0.4, -hh + 68 + h * 0.3);
      }
      g.lineStyle(3, shade(c, 1.4), 1).lineBetween(-hw * 0.7, -hh + 60 + h * 0.38 + 18, hw * 0.7, -hh + 60 + h * 0.38 + 18);
      g.fillStyle(0x9aa3ad, 1).fillCircle(-hw * 0.5, hh - 20, 6).fillCircle(hw * 0.5, hh - 20, 6);
      break;
    }
    case 'kettle': {
      g.lineStyle(5, 0x2a2a2a, 1);
      g.beginPath();
      g.arc(0, -hh * 0.1, hw * 0.55, Math.PI * 1.05, Math.PI * 1.95);
      g.strokePath();
      g.fillStyle(OUT, 0.9).fillTriangle(hw * 0.4, 0, hw + 4, -hh * 0.5, hw * 0.5, hh * 0.5);
      g.fillStyle(c, 1).fillTriangle(hw * 0.45, 2, hw, -hh * 0.45, hw * 0.5, hh * 0.45);
      g.fillStyle(OUT, 0.9).fillEllipse(0, hh * 0.25, w * 0.8 + 6, h * 0.72 + 6);
      g.fillStyle(c, 1).fillEllipse(0, hh * 0.25, w * 0.8, h * 0.72);
      g.fillStyle(shade(c, 1.4), 1).fillEllipse(-hw * 0.25, hh * 0.05, 12, 18);
      g.fillStyle(0x2a2a2a, 1).fillCircle(0, -hh * 0.15, 5);
      break;
    }
    case 'table': {
      box(g, -hw, -hh, w, 22, c, 4);
      g.fillStyle(shade(c, 1.25), 1).fillRect(-hw, -hh, w, 5);
      g.fillStyle(shade(c, 0.65), 1).fillRect(-hw + 14, -hh + 22, 16, h - 22).fillRect(hw - 30, -hh + 22, 16, h - 22);
      g.fillStyle(shade(c, 0.5), 1).fillRect(-hw + 30, -hh + 22, w - 60, 8);
      break;
    }
    case 'mug': {
      g.lineStyle(9, OUT, 0.9).strokeCircle(hw * 0.55, 0, 10);
      g.lineStyle(5, c, 1).strokeCircle(hw * 0.55, 0, 10);
      box(g, -hw, -hh, w * 0.8, h, c, 5);
      g.fillStyle(shade(c, 0.7), 1).fillRect(-hw + 4, -hh + 10, w * 0.8 - 8, 5);
      break;
    }
    case 'bread': {
      g.fillStyle(OUT, 0.9).fillRoundedRect(-hw - 3, -hh - 3, w + 6, h + 6, hh + 3);
      g.fillStyle(c, 1).fillRoundedRect(-hw, -hh, w, h, hh);
      g.lineStyle(3, shade(c, 0.65), 1);
      for (let i = -1; i <= 1; i++) g.lineBetween(i * w * 0.25 - 6, -hh + 6, i * w * 0.25 + 6, hh - 10);
      g.fillStyle(shade(c, 1.3), 1).fillRoundedRect(-hw + 8, -hh + 3, w - 16, 6, 3);
      break;
    }
    case 'cupboard': {
      box(g, -hw, -hh, w, h, c, 4);
      if (on) {
        g.fillStyle(0x140e0a, 1).fillRect(-hw + 8, -hh + 8, w / 2 - 8, h - 16);
        g.fillStyle(0xe8e0c8, 1).fillCircle(-hw + 26, -hh + 40, 12).fillCircle(-hw + 50, -hh + 40, 12);
        g.fillStyle(0x6f9a7a, 1).fillRect(-hw + 18, hh - 50, 18, 36).fillRect(-hw + 42, hh - 44, 16, 30);
        g.fillStyle(shade(c, 1.15), 1).fillPoints(pts([{ x: -hw, y: -hh }, { x: -hw - 34, y: -hh - 10 }, { x: -hw - 34, y: hh + 10 }, { x: -hw, y: hh }]), true);
      } else {
        g.lineStyle(4, shade(c, 0.65), 1).lineBetween(0, -hh + 6, 0, hh - 6);
        g.lineStyle(3, shade(c, 0.75), 1).strokeRect(-hw + 12, -hh + 14, w / 2 - 22, h - 28).strokeRect(10, -hh + 14, w / 2 - 22, h - 28);
        g.fillStyle(0xd9b45a, 1).fillCircle(-10, 0, 5).fillCircle(10, 0, 5);
      }
      break;
    }
    case 'pan': {
      g.lineStyle(3, 0x9aa3ad, 1).strokeCircle(0, -hh + 6, 6);
      g.fillStyle(OUT, 0.9).fillRect(-7, -hh + 10, 14, h * 0.42);
      g.fillStyle(shade(c, 0.8), 1).fillRect(-4, -hh + 10, 8, h * 0.42);
      g.fillStyle(OUT, 0.9).fillCircle(0, hh - hw + 2, hw + 3);
      g.fillStyle(c, 1).fillCircle(0, hh - hw + 2, hw);
      g.fillStyle(shade(c, 0.7), 1).fillCircle(0, hh - hw + 2, hw - 8);
      g.fillStyle(shade(c, 1.6), 0.5).fillCircle(-hw * 0.3, hh - hw * 1.3, 6);
      break;
    }
    case 'calendar': {
      g.fillStyle(0x9aa3ad, 1).fillCircle(0, -hh + 2, 4);
      box(g, -hw, -hh + 6, w, h - 6, c, 3);
      g.fillStyle(0x3f7f7a, 1).fillRect(-hw, -hh + 6, w, 18);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) g.fillStyle(0x3b4048, 0.8).fillRect(-hw + 8 + k * ((w - 16) / 4), -hh + 32 + r * 11, 7, 6);
      break;
    }
    case 'radio': {
      box(g, -hw, -hh, w, h, c, 10);
      g.fillStyle(shade(c, 0.6), 1).fillRoundedRect(-hw + 10, -hh + 10, w * 0.5, h - 20, 6);
      g.lineStyle(2, shade(c, 0.4), 1);
      for (let x = -hw + 16; x < -hw + 10 + w * 0.5; x += 7) g.lineBetween(x, -hh + 14, x, hh - 14);
      if (on) glow(g, hw * 0.45, -hh * 0.2, 22, 0xffd36b, 0.5);
      g.fillStyle(on ? 0xffd36b : 0x2a2a2a, 1).fillRoundedRect(hw * 0.2, -hh * 0.45, hw * 0.55, 12, 3);
      g.fillStyle(0x2a2a2a, 1).fillCircle(hw * 0.32, hh * 0.35, 6).fillCircle(hw * 0.65, hh * 0.35, 6);
      g.lineStyle(2, 0x2a2a2a, 1).lineBetween(hw * 0.5, -hh, hw * 0.8, -hh - 22);
      break;
    }
  }
}

// ------------------------------------------------------------------ intruders

export function drawIntruder(g: G, kind: IntruderKind, w: number, h: number): void {
  g.clear();
  const hw = w / 2;
  const hh = h / 2;
  const eye = PALETTE.ghostEye;
  switch (kind) {
    case 'shadow': {
      g.fillStyle(0x03040a, 0.92).fillCircle(0, -hh + hw * 0.55, hw * 0.55);
      g.fillStyle(0x03040a, 0.92).fillRoundedRect(-hw, -hh + hw * 0.9, w, h - hw * 0.9, { tl: hw, tr: hw, bl: 4, br: 4 });
      g.fillStyle(0x03040a, 0.92).fillRect(-hw * 0.25, -hh + hw * 0.9, hw * 0.5, 8);
      g.fillStyle(eye, 1).fillCircle(-hw * 0.2, -hh + hw * 0.55, 4).fillCircle(hw * 0.2, -hh + hw * 0.55, 4);
      break;
    }
    case 'face': {
      g.fillStyle(0xc8d0d8, 0.82).fillEllipse(0, 0, w, h);
      g.fillStyle(0x0a0c18, 0.95).fillEllipse(-hw * 0.38, -hh * 0.15, w * 0.22, h * 0.2).fillEllipse(hw * 0.38, -hh * 0.15, w * 0.22, h * 0.2);
      g.fillStyle(0x0a0c18, 0.9).fillEllipse(0, hh * 0.5, w * 0.2, h * 0.16);
      break;
    }
    case 'eyes': {
      g.fillStyle(0x000000, 0.6).fillEllipse(0, 0, w, h);
      for (const sx of [-1, 1]) {
        glow(g, sx * hw * 0.45, 0, 16, eye, 0.6);
        g.fillStyle(eye, 1).fillEllipse(sx * hw * 0.45, 0, 18, 10);
        g.fillStyle(0x000000, 1).fillEllipse(sx * hw * 0.45, 0, 4, 9);
      }
      break;
    }
    case 'hand': {
      const skin = 0xb8c2c8;
      g.fillStyle(skin, 0.95).fillRoundedRect(-hw * 0.55, hh * 0.1, w * 0.55 * 2, hh * 0.9, 10);
      for (let i = 0; i < 4; i++) {
        const x = -hw * 0.5 + i * (w * 0.28);
        g.fillStyle(skin, 0.95).fillRoundedRect(x, -hh, 11, hh * 1.3, 5);
        g.fillStyle(0x6a7478, 1).fillRect(x + 2, -hh + 2, 7, 6);
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ anomaly type icons

/** A small glyph per anomaly type, centred, `s` px tall. */
export function drawTypeIcon(g: G, type: AnomalyType, x: number, y: number, s: number, c: number): void {
  const u = s / 2;
  g.lineStyle(Math.max(3, s * 0.1), c, 1);
  g.fillStyle(c, 1);
  switch (type) {
    case 'moved':
      g.lineBetween(x - u, y, x + u * 0.6, y);
      g.fillTriangle(x + u, y, x + u * 0.4, y - u * 0.5, x + u * 0.4, y + u * 0.5);
      g.strokeRect(x - u, y - u * 0.9, u * 0.6, u * 0.6);
      break;
    case 'recolor':
      g.fillCircle(x - u * 0.35, y - u * 0.2, u * 0.45);
      g.fillStyle(c, 0.45).fillCircle(x + u * 0.35, y + u * 0.25, u * 0.45);
      break;
    case 'missing':
      for (let i = 0; i < 4; i++) {
        const a = x - u + i * (u * 0.55);
        g.lineBetween(a, y - u, a + u * 0.3, y - u);
        g.lineBetween(a, y + u, a + u * 0.3, y + u);
        g.lineBetween(x - u, a - x + y, x - u, a - x + y + u * 0.3);
        g.lineBetween(x + u, a - x + y, x + u, a - x + y + u * 0.3);
      }
      break;
    case 'extra':
      g.strokeRect(x - u, y - u * 0.8, u * 1.1, u * 1.1);
      g.fillRect(x - u * 0.2, y - u * 0.1, u * 1.1, u * 1.1);
      break;
    case 'resized':
      g.strokeRect(x - u * 0.4, y - u * 0.1, u * 0.6, u * 0.6);
      g.lineBetween(x - u * 0.1, y + u * 0.2, x + u, y - u);
      g.fillTriangle(x + u, y - u, x + u * 0.3, y - u, x + u, y - u * 0.3);
      break;
    case 'state':
      g.strokeRoundedRect(x - u, y - u * 0.5, u * 2, u, u * 0.5);
      g.fillCircle(x + u * 0.5, y, u * 0.36);
      break;
    case 'intruder':
      g.fillCircle(x, y - u * 0.5, u * 0.38);
      g.fillRoundedRect(x - u * 0.6, y - u * 0.05, u * 1.2, u * 1.05, { tl: u * 0.5, tr: u * 0.5, bl: 2, br: 2 });
      break;
  }
}

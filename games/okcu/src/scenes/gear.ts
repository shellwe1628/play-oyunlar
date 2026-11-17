/**
 * The forged bow's looks (six tiers, a glow that grows with the level) and the rank badges.
 * Drawn into Graphics, no textures; the glow motes are placed from time, so nothing allocates.
 */
import type Phaser from 'phaser';
import { bowGlow, bowTier, type BowTier } from '../sim/bow';
import { PALETTE } from '../textures';

type G = Phaser.GameObjects.Graphics;
const INK = PALETTE.ink;

/** Limb colour, highlight and string colour per tier. */
export const TIER_LOOK: Record<BowTier, { limb: number; light: number; string: number; tip: number }> = {
  wood: { limb: PALETTE.bow, light: PALETTE.bowLight, string: PALETTE.string, tip: PALETTE.bow },
  horn: { limb: 0xf0dcb4, light: 0xfff6e0, string: PALETTE.string, tip: 0x6b4a2a },
  steel: { limb: 0x8fa2bd, light: 0xe6efff, string: 0xdfe8ff, tip: 0x56657d },
  gilded: { limb: 0xf2b630, light: 0xfff0a0, string: 0xfff6d6, tip: 0xb5541d },
  crystal: { limb: 0x7fe6ff, light: 0xffffff, string: 0xe8fdff, tip: 0x9a7bff },
  mythic: { limb: 0xff5fd2, light: 0xfff0ff, string: 0xffffff, tip: 0x7a3cff },
};

/** HSV hue → RGB colour (s = 0.65, v = 1), for the mythic bow's cycling aura. */
export function hueColor(h: number): number {
  const k = (n: number) => (n + h * 6) % 6;
  const f = (n: number) => 1 - 0.65 * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
}

/** Colour of the aura at a level and time (mythic +18 and up cycles through the rainbow). */
export function auraColor(level: number, time: number): number {
  const gl = bowGlow(level);
  return gl.cycle ? hueColor((time * 0.25) % 1) : gl.color;
}

/**
 * The glow around a bow whose limbs run t1 → mid → t2 (any size): aura, sheen, motes and,
 * with `drawn` > 0, a light trail on the string from `sx, sy`.
 */
export function drawBowGlow(g: G, level: number, t1x: number, t1y: number, mx: number, my: number, t2x: number, t2y: number, s: number, time: number, drawn = 0, sx = 0, sy = 0): void {
  const gl = bowGlow(level);
  if (gl.aura <= 0 && gl.sheen <= 0) return;
  const col = auraColor(level, time);
  const pulse = 0.8 + Math.sin(time * 4) * 0.2;
  if (gl.aura > 0) {
    // soft coloured halo: three widening strokes along both limbs
    for (let k = 3; k >= 1; k--) {
      const w = (7 + k * 8) * s * (0.7 + gl.aura * 0.7);
      g.lineStyle(w, col, Math.min(0.6, gl.aura * 0.3 * pulse));
      g.lineBetween(t1x, t1y, mx, my).lineBetween(mx, my, t2x, t2y);
    }
    g.fillStyle(col, Math.min(0.55, 0.12 + gl.aura * 0.35) * pulse).fillCircle(mx, my, 30 * s * (0.7 + gl.aura * 0.6));
    g.fillStyle(col, gl.aura * 0.18 * pulse).fillCircle((t1x + mx) / 2, (t1y + my) / 2, 16 * s * (0.6 + gl.aura)).fillCircle((t2x + mx) / 2, (t2y + my) / 2, 16 * s * (0.6 + gl.aura));
  }
  if (gl.sheen > 0) {
    // a highlight sliding up and down the limbs
    const u = (Math.sin(time * 2.2) + 1) / 2;
    const hx = u < 0.5 ? t1x + (mx - t1x) * u * 2 : mx + (t2x - mx) * (u - 0.5) * 2;
    const hy = u < 0.5 ? t1y + (my - t1y) * u * 2 : my + (t2y - my) * (u - 0.5) * 2;
    g.fillStyle(PALETTE.white, 0.75 * gl.sheen).fillCircle(hx, hy, 3.4 * s);
    g.fillStyle(PALETTE.white, 0.25 * gl.sheen).fillCircle(hx, hy, 7 * s);
  }
  if (gl.particles) {
    for (let i = 0; i < 6; i++) {
      const ph = (time * 0.6 + i / 6) % 1;
      const along = (i * 0.37) % 1;
      const bx = t1x + (t2x - t1x) * along + (mx - (t1x + t2x) / 2) * Math.sin(along * Math.PI);
      const by = t1y + (t2y - t1y) * along + (my - (t1y + t2y) / 2) * Math.sin(along * Math.PI);
      const x = bx + Math.sin(time * 3 + i * 2.1) * 10 * s;
      const y = by - ph * 46 * s;
      const a = (1 - ph) * 0.9;
      g.fillStyle(gl.cycle ? hueColor((ph + i / 6) % 1) : col, a).fillCircle(x, y, (2.2 + (1 - ph) * 2.2) * s);
    }
  }
  if (gl.stringTrail && drawn > 0.05) {
    g.lineStyle(9 * s, col, 0.35 * drawn).lineBetween(t1x, t1y, sx, sy).lineBetween(t2x, t2y, sx, sy);
    for (let i = 0; i < 4; i++) {
      const k = (time * 3 + i / 4) % 1;
      g.fillStyle(PALETTE.white, (1 - k) * drawn).fillCircle(t1x + (sx - t1x) * k, t1y + (sy - t1y) * k, 2.4 * s);
      g.fillStyle(PALETTE.white, (1 - k) * drawn).fillCircle(t2x + (sx - t2x) * k, t2y + (sy - t2y) * k, 2.4 * s);
    }
  }
}

/** Tier decorations on the limbs (recurve curls, grip wrap, gems, shards, wings). */
export function drawBowTierBits(g: G, tier: BowTier, t1x: number, t1y: number, mx: number, my: number, t2x: number, t2y: number, s: number, time: number): void {
  const look = TIER_LOOK[tier];
  const nx = (t2y - t1y) / (Math.hypot(t2x - t1x, t2y - t1y) || 1);
  const ny = -(t2x - t1x) / (Math.hypot(t2x - t1x, t2y - t1y) || 1);
  // side away from the string (the bow's back)
  const bx = (mx - (t1x + t2x) / 2) >= 0 === nx >= 0 ? nx : -nx;
  const by = (mx - (t1x + t2x) / 2) >= 0 === nx >= 0 ? ny : -ny;
  switch (tier) {
    case 'horn':
      for (const [x, y] of [
        [t1x, t1y],
        [t2x, t2y],
      ] as const) {
        g.fillStyle(INK, 1).fillCircle(x + bx * 4 * s, y + by * 4 * s, 6.5 * s);
        g.fillStyle(look.tip, 1).fillCircle(x + bx * 4 * s, y + by * 4 * s, 4 * s);
      }
      break;
    case 'steel':
      g.fillStyle(INK, 1).fillCircle(mx, my, 8 * s);
      g.fillStyle(look.tip, 1).fillCircle(mx, my, 5.5 * s);
      g.lineStyle(2 * s, look.light, 0.9).lineBetween(mx - 4 * s, my - 4 * s, mx + 4 * s, my + 4 * s);
      break;
    case 'gilded':
      for (const [x, y, c] of [
        [t1x, t1y, PALETTE.danger],
        [t2x, t2y, PALETTE.danger],
        [mx, my, PALETTE.bubble],
      ] as const) {
        g.fillStyle(INK, 1).fillCircle(x, y, 6.5 * s);
        g.fillStyle(c, 1).fillCircle(x, y, 4.3 * s);
        g.fillStyle(PALETTE.white, 0.85).fillCircle(x - 1.2 * s, y - 1.4 * s, 1.5 * s);
      }
      break;
    case 'crystal':
      for (let i = 1; i <= 4; i++) {
        const k = i / 5;
        const x = t1x + (t2x - t1x) * k + (mx - (t1x + t2x) / 2) * Math.sin(k * Math.PI);
        const y = t1y + (t2y - t1y) * k + (my - (t1y + t2y) / 2) * Math.sin(k * Math.PI);
        const L = (7 + (i % 2) * 4) * s;
        g.fillStyle(INK, 1).fillTriangle(x - by * 3 * s, y + bx * 3 * s, x + by * 3 * s, y - bx * 3 * s, x + bx * (L + 3 * s), y + by * (L + 3 * s));
        g.fillStyle(look.limb, 1).fillTriangle(x - by * 1.6 * s, y + bx * 1.6 * s, x + by * 1.6 * s, y - bx * 1.6 * s, x + bx * L, y + by * L);
      }
      break;
    case 'mythic': {
      const flap = Math.sin(time * 5) * 0.25;
      for (const [x, y, sgn] of [
        [t1x, t1y, 1],
        [t2x, t2y, -1],
      ] as const) {
        for (let f = 0; f < 3; f++) {
          const len = (16 - f * 3) * s;
          const ang = Math.atan2(by, bx) + sgn * (0.5 + f * 0.35 + flap);
          const ex = x + Math.cos(ang) * len;
          const ey = y + Math.sin(ang) * len;
          g.lineStyle(7 * s, INK, 1).lineBetween(x, y, ex, ey);
          g.lineStyle(4 * s, f === 0 ? PALETTE.white : look.limb, 1).lineBetween(x, y, ex, ey);
        }
      }
      break;
    }
    default:
      break;
  }
}

/**
 * A standalone bow (title, forge, shop): vertical limbs centred on (x, y), facing right.
 * `size` is the half-length of the limbs in px.
 */
export function drawBowItem(g: G, x: number, y: number, size: number, level: number, time: number, flash = 0): void {
  const tier = bowTier(level);
  const look = TIER_LOOK[tier];
  const s = size / 40;
  const bend = 16 * s;
  const t1x = x - bend;
  const t1y = y - size;
  const t2x = x - bend;
  const t2y = y + size;
  const mx = x + 6 * s;
  const my = y;
  drawBowGlow(g, level, t1x, t1y, mx, my, t2x, t2y, s * 1.6, time);
  // limbs: a thick quadratic noodle
  const N = 10;
  const cx = 2 * mx - (t1x + t2x) / 2;
  const cy = 2 * my - (t1y + t2y) / 2;
  for (let pass = 0; pass < 3; pass++) {
    const w = pass === 0 ? 11 * s + 10 : pass === 1 ? 11 * s : 4 * s;
    const col = pass === 0 ? INK : pass === 1 ? (flash > 0 ? mixWhite(look.limb, flash) : look.limb) : look.light;
    g.lineStyle(w, col, pass === 2 ? 0.7 : 1);
    let px = t1x;
    let py = t1y;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const bx = u * u * t1x + 2 * u * t * cx + t * t * t2x;
      const by = u * u * t1y + 2 * u * t * cy + t * t * t2y;
      if (pass < 2 || (i > 1 && i < N)) g.lineBetween(px, py, bx, by);
      if (pass < 2) g.fillStyle(col, 1).fillCircle(bx, by, w / 2);
      px = bx;
      py = by;
    }
    if (pass < 2) g.fillStyle(col, 1).fillCircle(t1x, t1y, w / 2);
  }
  // grip
  g.fillStyle(INK, 1).fillRoundedRect(mx - 9 * s, my - 15 * s, 18 * s, 30 * s, 6 * s);
  g.fillStyle(tier === 'wood' ? PALETTE.shaft : look.tip, 1).fillRoundedRect(mx - 6 * s, my - 12 * s, 12 * s, 24 * s, 4 * s);
  // string
  g.lineStyle(3 * s + 1, look.string, 1).lineBetween(t1x, t1y, t2x, t2y);
  drawBowTierBits(g, tier, t1x, t1y, mx, my, t2x, t2y, s, time);
}

function mixWhite(c: number, k: number): number {
  const m = (v: number) => Math.round(v + (255 - v) * Math.min(1, k));
  return (m((c >> 16) & 0xff) << 16) | (m((c >> 8) & 0xff) << 8) | m(c & 0xff);
}

// ------------------------------------------------------------------ rank badges

const METALS = [0xc98a4b, 0xd8dde6, 0xffc93c, 0x8ff0ff] as const;
const METAL_DARK = [0x8a5528, 0x8f97a6, 0xc8902a, 0x5b8cff] as const;

/**
 * Rank badge: a shield whose metal shows the band (bronze, silver, gold, crystal) and whose
 * chevrons (1–3) show the step inside it. Twelve distinct badges.
 */
export function drawBadge(g: G, x: number, y: number, r: number, rank: number, time = 0, locked = false): void {
  const band = Math.min(3, Math.floor(rank / 3));
  const step = (rank % 3) + 1;
  const metal = locked ? PALETTE.locked : METALS[band]!;
  const dark = locked ? PALETTE.pipOff : METAL_DARK[band]!;
  const pts = (k: number) => [
    { x: x - r * k, y: y - r * 0.85 * k },
    { x: x + r * k, y: y - r * 0.85 * k },
    { x: x + r * k, y: y + r * 0.1 * k },
    { x: x, y: y + r * 1.05 * k },
    { x: x - r * k, y: y + r * 0.1 * k },
  ];
  g.fillStyle(INK, 1).fillPoints(pts(1.18) as unknown as Phaser.Math.Vector2[], true);
  g.fillStyle(dark, 1).fillPoints(pts(1) as unknown as Phaser.Math.Vector2[], true);
  g.fillStyle(metal, 1).fillPoints(pts(0.82) as unknown as Phaser.Math.Vector2[], true);
  // chevrons
  for (let i = 0; i < step; i++) {
    const cy = y - r * 0.25 + i * r * 0.32;
    g.lineStyle(r * 0.2 + 4, INK, 1).lineBetween(x - r * 0.5, cy - r * 0.18, x, cy + r * 0.12).lineBetween(x, cy + r * 0.12, x + r * 0.5, cy - r * 0.18);
    g.lineStyle(r * 0.2, locked ? PALETTE.white : dark, 1).lineBetween(x - r * 0.5, cy - r * 0.18, x, cy + r * 0.12).lineBetween(x, cy + r * 0.12, x + r * 0.5, cy - r * 0.18);
  }
  // the top band gets a star; crystal ranks sparkle
  if (band >= 2 && !locked) {
    const sy = y - r * 0.62;
    g.fillStyle(INK, 1).fillCircle(x, sy, r * 0.2);
    g.fillStyle(PALETTE.white, 1).fillCircle(x, sy, r * 0.13);
  }
  if (band === 3 && !locked) {
    const k = (Math.sin(time * 5) + 1) / 2;
    g.fillStyle(PALETTE.white, 0.5 + 0.5 * k).fillCircle(x + r * 0.55, y - r * 0.5, r * 0.08 + k * r * 0.06);
  }
  g.fillStyle(PALETTE.white, locked ? 0.15 : 0.35).fillEllipse(x - r * 0.4, y - r * 0.45, r * 0.4, r * 0.18);
}

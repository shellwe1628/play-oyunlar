/**
 * The animation layer: pure functions from (what the sim says, time) to visual offsets and
 * expressions. The renderer consults it every frame; nothing here is ever written back to the
 * sim, so hit boxes and outcomes are untouched (tests/unit/anim.test.ts proves it).
 *
 * Everything writes into caller-owned objects: no allocation per frame.
 */
import { PT } from '../sim/ragdoll';

export type Kind = 'player' | 'archer' | 'shield' | 'jumper' | 'bomber' | 'boss';
export type Eyes = 'open' | 'blink' | 'squint' | 'wide' | 'dizzy' | 'happy' | 'closed';
export type Mouth = 'smile' | 'flat' | 'o' | 'grin' | 'laugh' | 'frown' | 'roar';

export interface AnimInput {
  kind: Kind;
  id: number;
  alive: boolean;
  /** seconds, monotonic */
  t: number;
  scale: number;
  facing: number;
  /** string draw 0..1 */
  draw: number;
  /** enemy brain state (player: 'player') */
  brain: string;
  /** seconds since the last hit taken (large = long ago) */
  sinceHit: number;
  /** seconds since the last arrow loosed */
  sinceRelease: number;
  /** seconds since landing from a drop-in or hop */
  sinceLand: number;
  /** seconds since a cheer (player wave clear) */
  sinceCheer: number;
  /** seconds since this archer's arrow hit the player (enemy taunt) */
  sinceTaunt: number;
  /** health 0..1 */
  hp: number;
  /** direction the eyes should look (unit-ish), 0,0 = straight ahead */
  lookX: number;
  lookY: number;
  /** the title screen: idle charm loop for the player */
  title: boolean;
  /** result screen mood: 1 = great run, 0 = neutral, -1 = poor */
  mood: number;
}

export interface AnimOut {
  /** root offset of the whole body (px) */
  dx: number;
  dy: number;
  /** lean (radians) about the feet midpoint */
  lean: number;
  /** squash and stretch about the feet midpoint */
  sx: number;
  sy: number;
  /** per-part extra offsets (px) */
  headX: number;
  headY: number;
  handFX: number;
  handFY: number;
  handBX: number;
  handBY: number;
  footFY: number;
  footBY: number;
  eyes: Eyes;
  mouth: Mouth;
  lookX: number;
  lookY: number;
  /** extra lift for the scarf (0..1) */
  scarfLift: number;
  /** dizzy stars 0..1 */
  dizzy: number;
  /** sweat drop (scared) */
  sweat: boolean;
  /** laugh marks next to the head */
  laugh: boolean;
  /** bomber's juggled bomb height above the free hand (px), <0 = none */
  juggle: number;
  /** visual string draw (title "test the string"), <0 = use the sim's */
  drawOverride: number;
  /** boss stomp impact this frame (0..1, scene may shake) */
  stomp: number;
}

export function newAnimOut(): AnimOut {
  return {
    dx: 0,
    dy: 0,
    lean: 0,
    sx: 1,
    sy: 1,
    headX: 0,
    headY: 0,
    handFX: 0,
    handFY: 0,
    handBX: 0,
    handBY: 0,
    footFY: 0,
    footBY: 0,
    eyes: 'open',
    mouth: 'smile',
    lookX: 0,
    lookY: 0,
    scarfLift: 0,
    dizzy: 0,
    sweat: false,
    laugh: false,
    juggle: -1,
    drawOverride: -1,
    stomp: 0,
  };
}

function reset(o: AnimOut): void {
  o.dx = o.dy = o.lean = 0;
  o.sx = o.sy = 1;
  o.headX = o.headY = o.handFX = o.handFY = o.handBX = o.handBY = o.footFY = o.footBY = 0;
  o.eyes = 'open';
  o.mouth = 'smile';
  o.lookX = o.lookY = 0;
  o.scarfLift = 0;
  o.dizzy = 0;
  o.sweat = false;
  o.laugh = false;
  o.juggle = -1;
  o.drawOverride = -1;
  o.stomp = 0;
}

/** Deterministic per-archer phase so a crowd never moves in lockstep. */
export function phase(id: number): number {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * Math.PI * 2;
}

/** True while this archer's eyes are shut for a blink (about every 2.6–4 s, 0.12 s long). */
export function blinking(id: number, t: number): boolean {
  const period = 2.6 + (phase(id) / (Math.PI * 2)) * 1.4;
  const k = (t + phase(id)) % period;
  return k < 0.12 || (id % 3 === 0 && k > 0.3 && k < 0.42); // some archers double-blink
}

const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** A 0→1→0 bump over [0, d]. */
const bump = (t: number, d: number): number => (t < 0 || t > d ? 0 : Math.sin((t / d) * Math.PI));

/** Fill `o` with this frame's animation for one archer. Pure: same input, same output. */
export function animate(i: AnimInput, o: AnimOut): void {
  reset(o);
  if (!i.alive) {
    o.eyes = 'closed';
    o.mouth = 'o';
    return;
  }
  const s = i.scale;
  const t = i.t + phase(i.id);
  const f = i.facing;
  // --- base life: breathing and a slow weight shift
  const breath = Math.sin(t * 2.1);
  o.dy = breath * 1.4 * s;
  o.sy = 1 + breath * 0.012;
  o.sx = 1 - breath * 0.008;
  o.lean = Math.sin(t * 0.7) * 0.025;
  o.headY = Math.sin(t * 2.1 - 0.6) * 1.2 * s;
  o.lookX = i.lookX;
  o.lookY = i.lookY;
  if (blinking(i.id, i.t)) o.eyes = 'blink';

  // --- personality loops (only while not drawing)
  const idle = i.draw < 0.05 && i.brain !== 'jump' && i.brain !== 'spawn';
  switch (i.kind) {
    case 'player':
      if (i.title) titleIdle(i, o);
      break;
    case 'archer': {
      // impatient foot tap
      if (idle) {
        const tap = Math.max(0, Math.sin(t * 7));
        o.footFY = -tap * 6 * s;
      }
      break;
    }
    case 'shield': {
      // ducks behind the shield and peeks over it
      if (idle) {
        const cyc = (t * 0.45) % 1;
        const duck = cyc < 0.5 ? ease(cyc / 0.12) * (1 - ease((cyc - 0.38) / 0.12)) : 0;
        o.dy += duck * 16 * s;
        o.sy -= duck * 0.08;
        o.headX += -f * duck * 4 * s;
        if (duck > 0.6) o.eyes = 'squint';
        else if (cyc > 0.5 && cyc < 0.62) o.headY -= bump(cyc - 0.5, 0.12) * 8 * s; // pop up
      }
      break;
    }
    case 'jumper': {
      // bounces on its toes, all the time
      const b = Math.abs(Math.sin(t * 5.2));
      o.dy -= b * 7 * s;
      o.sy *= 1 + (b - 0.5) * 0.08;
      o.sx *= 1 - (b - 0.5) * 0.05;
      break;
    }
    case 'bomber': {
      // juggles a bomb in the free hand
      if (idle) {
        const k = (t * 1.6) % 1;
        o.juggle = Math.sin(k * Math.PI) * 46 * s;
        o.handBY -= (1 - Math.sin(k * Math.PI)) * 6 * s;
        o.lookY = -0.8;
        o.lookX = 0.2 * f;
      }
      break;
    }
    case 'boss': {
      // stomps: lift, slam, settle
      const cyc = (t * 0.35) % 1;
      if (idle && cyc < 0.3) {
        const lift = bump(cyc, 0.22);
        o.footFY -= lift * 22 * s;
        o.lean += -f * lift * 0.05;
        if (cyc > 0.21 && cyc < 0.25) o.stomp = 1;
        o.mouth = 'grin';
      }
      o.mouth = o.mouth === 'smile' ? 'flat' : o.mouth;
      break;
    }
  }

  // --- landing squash (drop-in or hop)
  if (i.sinceLand >= 0 && i.sinceLand < 0.45) {
    const k = i.sinceLand / 0.45;
    const sq = Math.sin(k * Math.PI * 1.5) * (1 - k);
    o.sy *= 1 - sq * 0.28;
    o.sx *= 1 + sq * 0.2;
  }
  // --- boss entry: a proper roar beat right after landing
  if (i.kind === 'boss' && i.sinceLand >= 0 && i.sinceLand < 1.4) {
    const r = bump(i.sinceLand - 0.25, 1.1);
    o.lean += -f * r * 0.18;
    o.handFY -= r * 30 * s;
    o.handBY -= r * 36 * s;
    o.headY -= r * 6 * s;
    if (r > 0.2) {
      o.mouth = 'roar';
      o.eyes = 'wide';
    }
  }

  // --- drawing: anticipation (lean back, squint, scarf lifts)
  if (i.draw > 0.05) {
    o.lean += -f * i.draw * 0.09;
    o.headX += -f * i.draw * 3 * s;
    o.eyes = o.eyes === 'blink' ? 'blink' : 'squint';
    o.mouth = 'flat';
    o.scarfLift = i.draw;
  }
  // --- release follow-through: snap forward, then settle
  if (i.sinceRelease >= 0 && i.sinceRelease < 0.35) {
    const k = i.sinceRelease / 0.35;
    const p = Math.sin(k * Math.PI) * (1 - k * 0.5);
    o.lean += f * p * 0.11;
    o.handBX -= f * p * 14 * s;
    o.handBY -= p * 6 * s;
    o.mouth = 'o';
  }
  // --- player cheer on a wave clear: two hops with the bow raised
  if (i.kind === 'player' && i.sinceCheer >= 0 && i.sinceCheer < 1.1) {
    const k = i.sinceCheer;
    const hop = bump(k, 0.45) + bump(k - 0.5, 0.45) * 0.7;
    o.dy -= hop * 34 * s;
    o.sy *= 1 + hop * 0.08;
    o.handFY -= 38 * s * Math.min(1, k * 6) * (1 - ease((k - 0.9) / 0.2));
    o.eyes = 'happy';
    o.mouth = 'grin';
  }
  // --- enemy taunt after hitting the player: belly laugh
  if (i.kind !== 'player' && i.sinceTaunt >= 0 && i.sinceTaunt < 1.2) {
    const shake = Math.sin(i.sinceTaunt * 40) * (1 - i.sinceTaunt / 1.2);
    o.dy += Math.abs(shake) * 4 * s;
    o.lean += -f * 0.08;
    o.headY += shake * 2 * s;
    o.eyes = 'happy';
    o.mouth = 'laugh';
    o.laugh = true;
  }
  // --- scared at low health (player)
  if (i.kind === 'player' && i.hp < 0.3 && i.sinceCheer > 1.1) {
    o.sweat = true;
    if (o.eyes === 'open') o.eyes = 'wide';
    if (o.mouth === 'smile') o.mouth = 'frown';
    o.footFY += Math.sin(i.t * 40) * 1.2 * s; // knocking knees
    o.dx += Math.sin(i.t * 33) * 0.8 * s;
  }
  // --- hit: flinch, then a dizzy wobble
  if (i.sinceHit >= 0 && i.sinceHit < 1.3) {
    const fl = Math.max(0, 1 - i.sinceHit / 0.25);
    o.sy *= 1 - fl * 0.1;
    o.headX += f * fl * -6 * s;
    if (i.sinceHit > 0.3) {
      o.dizzy = 1 - ease((i.sinceHit - 1.0) / 0.3);
      o.eyes = 'dizzy';
      o.mouth = 'o';
      o.headX += Math.sin(i.t * 9) * 3 * s * o.dizzy;
      o.lean += Math.sin(i.t * 6) * 0.04 * o.dizzy;
    } else {
      o.eyes = 'closed';
      o.mouth = 'o';
    }
  }
  // --- result screen mood
  if (i.mood > 0) {
    const k = (i.t * 1.2) % 1;
    const hop = bump(k, 0.5);
    o.dy -= hop * 24 * s;
    o.handFY -= 34 * s;
    o.eyes = 'happy';
    o.mouth = 'grin';
  } else if (i.mood < 0) {
    o.dy += 6 * s;
    o.lean += f * 0.12;
    o.headY += 7 * s;
    o.headX += f * 4 * s;
    o.eyes = Math.sin(i.t * 0.8) > 0.6 ? 'closed' : 'squint';
    o.mouth = 'frown';
    o.lookY = 0.7;
  }
  clampOffsets(o, s);
}

/** Stacked reactions (a title stretch during a cheer) never pull a limb off the body. */
function clampOffsets(o: AnimOut, s: number): void {
  const m = 64 * s;
  const c = (v: number) => (v > m ? m : v < -m ? -m : v);
  o.dx = c(o.dx);
  o.dy = c(o.dy);
  o.headX = c(o.headX);
  o.headY = c(o.headY);
  o.handFX = c(o.handFX);
  o.handFY = c(o.handFY);
  o.handBX = c(o.handBX);
  o.handBY = c(o.handBY);
  o.footFY = c(o.footFY);
  o.footBY = c(o.footBY);
}

/** Title idle loop: stretch → test the string → look at the player (with a wink). */
function titleIdle(i: AnimInput, o: AnimOut): void {
  const cyc = i.t % 7;
  if (cyc < 1.4) {
    // stretch: arms up, rise on toes, yawn
    const k = bump(cyc, 1.4);
    o.handFY -= k * 46 * i.scale;
    o.handBY -= k * 52 * i.scale;
    o.dy -= k * 6 * i.scale;
    o.sy *= 1 + k * 0.05;
    o.eyes = k > 0.4 ? 'closed' : o.eyes;
    o.mouth = k > 0.4 ? 'o' : o.mouth;
  } else if (cyc > 2.2 && cyc < 4.0) {
    // test the string twice
    const k = cyc - 2.2;
    o.drawOverride = Math.max(bump(k, 0.8), bump(k - 0.9, 0.8)) * 0.65;
    o.eyes = 'squint';
  } else if (cyc > 4.6 && cyc < 6.4) {
    // look at the player and wink
    o.lookX = 0;
    o.lookY = 0;
    o.headX -= i.facing * 3 * i.scale;
    if (cyc > 5.2 && cyc < 5.5) o.eyes = 'happy';
    o.mouth = 'grin';
  }
}

/**
 * Apply the root transform (offset, lean and squash about the feet) and the per-part offsets
 * to a body's points, writing the drawn positions into (vx, vy). The body is only read.
 */
export function posePoints(bx: ArrayLike<number>, by: ArrayLike<number>, n: number, o: AnimOut, vx: Float64Array, vy: Float64Array): void {
  const fx = (bx[PT.footF]! + bx[PT.footB]!) / 2;
  const fy = (by[PT.footF]! + by[PT.footB]!) / 2;
  const c = Math.cos(o.lean);
  const sn = Math.sin(o.lean);
  for (let k = 0; k < n; k++) {
    let x = (bx[k]! - fx) * o.sx;
    let y = (by[k]! - fy) * o.sy;
    const rx = x * c - y * sn;
    const ry = x * sn + y * c;
    x = fx + rx + o.dx;
    y = fy + ry + o.dy;
    vx[k] = x;
    vy[k] = y;
  }
  vx[PT.head] = vx[PT.head]! + o.headX;
  vy[PT.head] = vy[PT.head]! + o.headY;
  vx[PT.handF] = vx[PT.handF]! + o.handFX;
  vy[PT.handF] = vy[PT.handF]! + o.handFY;
  vx[PT.elbowF] = vx[PT.elbowF]! + o.handFX * 0.5;
  vy[PT.elbowF] = vy[PT.elbowF]! + o.handFY * 0.5;
  vx[PT.handB] = vx[PT.handB]! + o.handBX;
  vy[PT.handB] = vy[PT.handB]! + o.handBY;
  vx[PT.elbowB] = vx[PT.elbowB]! + o.handBX * 0.5;
  vy[PT.elbowB] = vy[PT.elbowB]! + o.handBY * 0.5;
  vy[PT.footF] = vy[PT.footF]! + o.footFY;
  vy[PT.kneeF] = vy[PT.kneeF]! + o.footFY * 0.6;
  vy[PT.footB] = vy[PT.footB]! + o.footBY;
  vy[PT.kneeB] = vy[PT.kneeB]! + o.footBY * 0.6;
}

/** The same root transform for a single point (arrows stuck in the body ride along). */
export function posePoint(bx: ArrayLike<number>, by: ArrayLike<number>, o: AnimOut, x: number, y: number, out: { x: number; y: number }): void {
  const fx = (bx[PT.footF]! + bx[PT.footB]!) / 2;
  const fy = (by[PT.footF]! + by[PT.footB]!) / 2;
  const c = Math.cos(o.lean);
  const sn = Math.sin(o.lean);
  const lx = (x - fx) * o.sx;
  const ly = (y - fy) * o.sy;
  out.x = fx + lx * c - ly * sn + o.dx;
  out.y = fy + lx * sn + ly * c + o.dy;
}

/**
 * A stand-alone animated archer for menus (result screen, shop preview): its own little
 * ragdoll held in pose by muscles, driven by the same animation layer as the game.
 */
import type Phaser from 'phaser';
import { animate, newAnimOut, posePoints, type AnimInput, type Kind } from '../anim/anim';
import { stepBody } from '../sim/body';
import type { Cosmetic } from '../sim/meta';
import { createRagdoll, LEG_HEIGHT, setPose } from '../sim/ragdoll';
import type { Archer } from '../sim/world';
import { bowGeomOf, createScarf, drawArcher, lookFor, stepScarf, type Scarf } from './art';
import type { BowGeom } from './gear';
import { PT } from '../sim/ragdoll';

let nextId = 10_000;

export class Puppet {
  readonly archer: Archer;
  private readonly out = newAnimOut();
  private readonly vx = new Float64Array(11);
  private readonly vy = new Float64Array(11);
  private readonly view = { x: this.vx, y: this.vy };
  private readonly scarf: Scarf;
  private readonly inp: AnimInput;
  private t = 0;
  private readonly ax: number;
  private readonly ay: number;

  constructor(kind: Kind, x: number, footY: number, facing: number, scale: number) {
    const ay = footY - LEG_HEIGHT * scale;
    this.ax = x;
    this.ay = ay;
    const body = createRagdoll(x, ay, facing, scale);
    const id = nextId++;
    this.archer = {
      id,
      type: kind,
      body,
      scale,
      facing,
      hp: 1,
      maxHp: 1,
      alive: true,
      gone: false,
      aim: facing > 0 ? -0.35 : Math.PI + 0.35,
      draw: 0,
      hurt: 9,
      helmet: false,
      shield: null,
      shieldOn: false,
      brain: 'wait',
    } as unknown as Archer;
    this.scarf = createScarf(x, ay - 45 * scale);
    this.inp = { kind, id, alive: true, t: 0, scale, facing, draw: 0, brain: 'player', sinceHit: 99, sinceRelease: 99, sinceLand: 99, sinceCheer: 99, sinceTaunt: 99, hp: 1, lookX: 0, lookY: 0, title: false, mood: 0 };
    for (let i = 0; i < 90; i++) this.step(1 / 60);
  }

  /** mood: 1 cheering, 0 idle, -1 glum; title: the idle charm loop. */
  setMood(mood: number, title = false): void {
    this.inp.mood = mood;
    this.inp.title = title;
  }

  step(dt: number): void {
    this.t += dt;
    const a = this.archer;
    setPose(a.body, this.ax, this.ay, a.facing, a.aim, 0, a.scale, 0, 0);
    stepBody(a.body, Math.min(dt, 1 / 30), []);
    this.inp.t = this.t;
    animate(this.inp, this.out);
    posePoints(a.body.x, a.body.y, a.body.n, this.out, this.vx, this.vy);
    stepScarf(this.scarf, this.vx[PT.neck]! - a.facing * 4, this.vy[PT.neck]! + 4, a.facing > 0 ? -520 : 520, Math.max(1 / 240, Math.min(dt, 1 / 30)), this.t, this.out.scarfLift);
  }

  /** Where its bow is this frame (for the glow). */
  bowGeom(out: BowGeom): BowGeom {
    return bowGeomOf(this.archer, { view: this.view, face: this.out }, out);
  }

  draw(g: Phaser.GameObjects.Graphics, cosmetic: Cosmetic, bowLevel?: number): void {
    drawArcher(g, this.archer, lookFor(this.archer, cosmetic), {
      ...(bowLevel !== undefined ? { bowLevel } : {}),
      time: this.t,
      scarf: this.scarf,
      flash: 0,
      hpBar: false,
      telegraph: false,
      weakHint: false,
      view: this.view,
      face: this.out,
    });
  }
}

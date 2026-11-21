/**
 * Every archer of the world as the Mixamo character, posed each frame from its ragdoll points
 * (rig.ts explains how). The 2D game's pure animation layer (idle sway, anticipation, cheers,
 * taunts) runs on top of the physics points exactly as it does there, so a hit, a tumble off the
 * ledge or a heap on the ground is the simulation's own motion, never a canned clip.
 *
 * Puppets are pooled and keyed by archer id; a restart (new world object) retires them all.
 */
import * as THREE from 'three';
import { animate, newAnimOut, posePoints, type AnimInput, type AnimOut, type Kind } from '@okcu/anim/anim';
import { PALETTE } from '@okcu/textures';
import { castsSpells } from '@sim/combat';
import type { WeaponId } from '@sim/weapons';
import type { Archer, World } from '@sim/world';
import type { Assets } from '../assets';
import type { ArchersView, BowHandle, Frame, Game, Stage } from '../contract';
import { Gear, recoil } from './archers/gear';
import { lookFor, type Look } from './archers/looks';
import { Outfit } from './archers/outfit';
import { uprightView } from './archers/upright';
import { ArcherRig, createRigKit } from './rig';
import { celestialTime } from './weapons';

interface Puppet {
  rig: ArcherRig;
  gear: Gear;
  outfit: Outfit;
  handle: BowHandle;
  out: AnimOut;
  vx: Float64Array;
  vy: Float64Array;
  release: number;
  land: number;
  cheer: number;
  taunt: number;
  brain: string;
  /** 1 = soles flat (standing), eases to 0 when limp */
  flat: number;
  seen: boolean;
  look: Look | null;
  /** 1 → 0 after a hit: the body bulges and wobbles back (drawing only), and its flash colour */
  hitK: number;
  hitCol: THREE.Color;
}

function animKind(t: Archer['type']): Kind {
  switch (t) {
    case 'healer':
    case 'ward':
    case 'mage':
      return 'shield';
    case 'cover':
    case 'catcher':
    case 'imp':
    case 'volley':
    case 'armored':
      return 'archer';
    case 'elite':
      return 'boss';
    default:
      return t;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const FIRE = new THREE.Color(1, 0.42, 0.06);
const GOLD = new THREE.Color(1, 0.86, 0.35);
const HURT = new THREE.Color(1, 0.35, 0.35);
const FROST = new THREE.Color(PALETTE.frost);

/**
 * The player's shot with a new weapon, on top of the bow's own follow-through (px offsets on the
 * animation layer's hands; drawing only): the crossbow and the firework tube kick the arms back
 * and up, the spear and the boomerang are cocked behind the head while drawing and thrown with an
 * overhand swing of the string arm, the slingshot's hand rides forward a touch.
 */
function weaponPose(weapon: WeaponId, since: number, draw: number, f: number, s: number, o: AnimOut): void {
  const r = recoil(since);
  switch (weapon) {
    case 'crossbow':
      o.handFX -= f * r * 12 * s;
      o.handFY -= r * 8 * s;
      o.handBX -= f * r * 9 * s;
      o.handBY -= r * 5 * s;
      o.lean -= f * r * 0.06;
      break;
    case 'firework':
      o.handFX -= f * r * 16 * s;
      o.handFY -= r * 15 * s;
      o.handBX -= f * r * 12 * s;
      o.handBY -= r * 6 * s;
      o.lean -= f * r * 0.12;
      o.dx -= f * r * 5 * s;
      break;
    case 'spear':
    case 'boomerang': {
      const spear = weapon === 'spear';
      // cocked: the throwing hand lifts behind the head as the throw is drawn
      o.handBY -= draw * (spear ? 12 : 24) * s;
      o.handBX -= f * draw * (spear ? 4 : 8) * s;
      const dur = spear ? 0.42 : 0.34;
      if (since >= 0 && since < dur) {
        // the throw: the arm whips over the top and follows through past the bow hand
        const k = since / dur;
        const p = Math.sin(k * Math.PI);
        const reach = (spear ? 88 : 70) * s;
        o.handBX += f * reach * Math.sin(Math.min(1, k * 1.6) * (Math.PI / 2)) * (1 - 0.55 * k * k);
        o.handBY -= (spear ? 22 : 34) * s * Math.sin(Math.min(1, k * 2.2) * Math.PI) - 18 * s * k * (1 - k);
        o.handFY += p * 10 * s;
        o.lean += f * p * (spear ? 0.16 : 0.1);
      }
      break;
    }
    case 'sling': {
      if (since >= 0 && since < 0.3) o.handFX += f * Math.sin((since / 0.3) * Math.PI) * 6 * s;
      break;
    }
    default:
      break;
  }
}

export function createArchers(stage: Stage, assets: Assets, game: Game): ArchersView {
  const kit = createRigKit(assets);
  const puppets = new Map<number, Puppet>();
  const spare: Puppet[] = [];
  const inp: AnimInput = { kind: 'player', id: 0, alive: true, t: 0, scale: 1, facing: 1, draw: 0, brain: '', sinceHit: 99, sinceRelease: 99, sinceLand: 99, sinceCheer: 99, sinceTaunt: 99, hp: 1, lookX: 0, lookY: 0, title: false, mood: 0 };
  let animT = 0;
  let lastWorld: World | null = null;

  function make(): Puppet {
    const rig = new ArcherRig(kit);
    const gear = new Gear();
    const outfit = new Outfit(rig, stage.renderer);
    const grip = new THREE.Object3D();
    stage.scene.add(rig.group, gear.group, outfit.group, grip);
    return { rig, gear, outfit, handle: { meshes: [gear.bow], grip, tips: gear.tips }, out: newAnimOut(), vx: new Float64Array(11), vy: new Float64Array(11), release: -99, land: -99, cheer: -99, taunt: -99, brain: '', flat: 1, seen: false, look: null, hitK: 0, hitCol: new THREE.Color(1, 1, 1) };
  }

  function puppetFor(w: World, a: Archer): Puppet {
    let p = puppets.get(a.id);
    if (!p) {
      p = spare.pop() ?? make();
      p.release = p.land = p.cheer = p.taunt = -99;
      p.hitK = 0;
      p.brain = a.brain;
      p.flat = 1;
      p.rig.group.visible = true;
      p.outfit.group.visible = true;
      p.handle.grip.visible = true;
      const look = lookFor(a);
      p.look = look;
      p.rig.uniforms.uTint.value.setHex(look.body);
      p.rig.uniforms.uRim.value.setHex(look.accent);
      p.gear.style(look.bow, a.type === 'player');
      p.outfit.dress(a, look, a.type === 'player' ? w.meta.hp : 0);
      puppets.set(a.id, p);
    }
    return p;
  }

  function mark(id: number, what: 'release' | 'taunt' | 'cheer'): void {
    const p = puppets.get(id);
    if (p) p[what] = animT;
  }

  function retire(id: number, p: Puppet): void {
    p.rig.group.visible = false;
    p.gear.group.visible = false;
    p.outfit.group.visible = false;
    p.handle.grip.visible = false;
    puppets.delete(id);
    spare.push(p);
  }

  function drawOne(w: World, a: Archer, frame: Frame): void {
    if (a.gone) return;
    const p = puppetFor(w, a);
    p.seen = true;
    // fog: an archer still hidden in it is not drawn (it pops out with a puff, fx 'reveal')
    const hidden = a.veil > 0;
    p.rig.group.visible = !hidden;
    p.outfit.group.visible = !hidden;
    if ((p.brain === 'spawn' || p.brain === 'jump') && a.brain !== 'spawn' && a.brain !== 'jump') p.land = animT;
    p.brain = a.brain;
    inp.kind = animKind(a.type);
    inp.id = a.id;
    inp.alive = a.alive;
    inp.t = animT;
    inp.scale = a.scale;
    inp.facing = a.facing;
    inp.draw = a.draw;
    inp.brain = a.type === 'player' ? 'player' : a.brain;
    inp.sinceHit = a.hurt < 9 ? a.hurt : 99;
    inp.sinceRelease = animT - p.release;
    inp.sinceLand = animT - p.land;
    inp.sinceCheer = animT - p.cheer;
    inp.sinceTaunt = animT - p.taunt;
    inp.hp = a.maxHp > 0 ? a.hp / a.maxHp : 1;
    inp.title = w.phase === 'title' && a.type === 'player';
    inp.mood = 0;
    animate(inp, p.out);
    // the player's weapon (enemies always shoot bows)
    const weapon: WeaponId = a.type === 'player' ? w.stats.weapon : 'bow';
    if (weapon !== 'bow') weaponPose(weapon, inp.sinceRelease, a.alive ? (p.out.drawOverride >= 0 ? p.out.drawOverride : a.draw) : 0, a.facing >= 0 ? 1 : -1, a.scale, p.out);
    posePoints(a.body.x, a.body.y, a.body.n, p.out, p.vx, p.vy);

    const draw = p.out.drawOverride >= 0 ? p.out.drawOverride : a.draw;
    const standing = a.alive && a.falling <= 0 && a.brain !== 'jump' && a.brain !== 'spawn';
    p.flat += ((standing ? 1 : 0) - p.flat) * Math.min(1, frame.real * 12);
    // a standing archer never folds its head behind its back (drawing only)
    uprightView(p.vx, p.vy, p.flat);
    const rig = p.rig;
    // the string is held while drawing; the arrow shows whenever one is nocked
    const nocked = a.alive && draw > 0.02;
    // impact squash: the hit body bulges, then wobbles back (an elastic, ~0.3 s; looks only)
    p.hitK = Math.max(0, p.hitK - frame.real * 3.4);
    const bulge = p.hitK > 0 ? 1 + 0.17 * p.hitK * Math.cos((1 - p.hitK) * 15) : 1;
    rig.pose({ x: p.vx, y: p.vy, facing: a.facing, scale: a.scale * bulge, flat: p.flat, aim: a.aim, aimed: nocked ? Math.min(1, draw * 4) : 0 });

    // a boomerang is in the hand only once the last one is back
    const ready = a.type === 'player' ? w.reload <= 0 && (weapon !== 'boomerang' || !w.arrows.some((x) => x.active && x.owner === 'player' && x.kind === 'boomerang')) : a.brain === 'draw' && a.type !== 'bomber';
    p.gear.update({ facing: a.facing, scale: a.scale, gx: rig.hand.x, gy: rig.hand.y, gz: rig.hand.z, angle: rig.hand.angle, draw: nocked ? draw : 0, nocked, nx: rig.pinch.x, ny: rig.pinch.y, arrow: a.alive && ready && (nocked || a.type === 'player'), visible: !castsSpells(a.type) && !hidden, weapon, since: inp.sinceRelease, celestial: a.type === 'player' && game.celestial });
    const f = a.facing >= 0 ? 1 : -1;
    // the glow rides the weapon in hand (the bow, or the selected weapon's model)
    p.handle.meshes[0] = p.gear.glowMesh();
    p.handle.grip.position.set(f * rig.hand.x, rig.hand.y, rig.hand.z);
    p.handle.grip.rotation.z = f < 0 ? Math.PI - rig.hand.angle : rig.hand.angle;

    // hit flash, then the flicker of a burn
    const u = rig.uniforms;
    if (a.hurt < 0.14) {
      u.uFlashCol.value.copy(p.hitK > 0 ? p.hitCol : WHITE);
      u.uFlash.value = 0.75 * (1 - a.hurt / 0.14);
    } else if (a.burn > 0 && a.alive) {
      u.uFlashCol.value.copy(FIRE);
      u.uFlash.value = 0.3 + 0.16 * Math.sin(animT * 23 + a.id);
    } else if (a.chill > 0 && a.alive) {
      // frost arrows: an icy sheen while the archer's clock runs slow
      u.uFlashCol.value.copy(FROST);
      u.uFlash.value = 0.34 * Math.min(1, a.chill / 1.2) + 0.05 * Math.sin(animT * 5 + a.id);
    } else u.uFlash.value = 0;
    p.outfit.update(w, a, p.vx, p.vy, animT);
  }

  function update(frame: Frame): void {
    const { w, real, events } = frame;
    animT += real;
    celestialTime.value += real;
    if (w !== lastWorld) {
      // a restart swapped the world: ids start over, so every puppet is stale
      for (const [id, p] of puppets) retire(id, p);
      lastWorld = w;
    }
    for (const e of events) {
      if (e.t === 'shot') mark(w.player.id, 'release');
      else if (e.t === 'enemyShot') mark(e.id, 'release');
      else if (e.t === 'playerHit' && e.by >= 0) mark(e.by, 'taunt');
      else if (e.t === 'caught') mark(e.id, 'taunt');
      else if (e.t === 'waveClear') mark(w.player.id, 'cheer');
      else if (e.t === 'hit' || e.t === 'playerHit') {
        const p = puppets.get(e.t === 'hit' ? e.id : w.player.id);
        if (p) {
          // a headshot or crit lands harder and flashes gold; a knockout hardest
          const hard = e.t === 'hit' && (e.slowmo || e.crit || e.ko);
          // a barrage's extra arrow only nudges a bulge already running, never restarts it
          if (e.t === 'hit' && e.extra && !e.ko) p.hitK = Math.max(p.hitK, 0.35);
          else {
            p.hitK = hard ? 1 : 0.7;
            p.hitCol.copy(e.t === 'playerHit' ? HURT : hard ? GOLD : WHITE);
          }
        }
      }
    }
    for (const p of puppets.values()) p.seen = false;
    drawOne(w, w.player, frame);
    for (const a of w.enemies) drawOne(w, a, frame);
    for (const [id, p] of puppets) if (!p.seen) retire(id, p);
  }

  return {
    update,
    bowOf(id) {
      const p = puppets.get(id);
      return p && p.gear.group.visible ? p.handle : null;
    },
  };
}

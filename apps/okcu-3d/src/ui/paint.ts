/**
 * Everything the HUD draws as shapes, on one canvas over the 3D view: the aim feedback
 * (GameScene.renderAim), the health bar, coin, wind sock, bonus timer and focus gauge
 * (GameScene.syncHud / drawFocusGauge), flying coins (Fx.coins), the title's ghost thumb, and the
 * markers the 2D game draws beside archers (health pills, the "!" telegraph, the reload ring).
 *
 * HUD shapes are drawn in logical px exactly as the 2D game draws them; world-anchored shapes get
 * their position from `stage.toScreen` so they sit on the 3D scene.
 */
import { DRAG_DEAD } from '@okcu/scenes/keys';
import { drawHeart } from '@okcu/scenes/icons';
import { drawWind } from '@okcu/scenes/props';
import { PALETTE, TEXTURES } from '@okcu/textures';
import { PT } from '@sim/ragdoll';
import { TUNING } from '@sim/tuning';
import { arrowSpeed, canShoot, effectiveAngle, OVERDRAW_POWER, playerOrigin, type World } from '@sim/world';
import type { AimState, Stage } from '../contract';
import { el, H, W } from './dom';
import { Gfx } from './gfx';

const COIN = TEXTURES.find((t) => t.key === 'coin');

/** HUD anchor points, logical px (GameScene.buildHud with L.top = 0). */
export const HUD = {
  top: 64,
  hpX: 84,
  coinTextRight: 592,
  cornerX: 658,
  windX: 600,
  windY: 214,
  bonusX: 160,
  bonusY: 192,
  focusX: 628,
  focusY: 1160,
} as const;

export interface PullState {
  /** CSS px inside the stage root: where the thumb went down and where it is */
  x0: number;
  y0: number;
  x: number;
  y: number;
}

interface FlyingCoin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  home: number;
  onArrive: () => void;
}

export interface Painter {
  /** px per logical px, and the logical frame's offset inside the stage root (CSS px) */
  readonly k: number;
  readonly ox: number;
  readonly oy: number;
  /** true when the canvas size changed this frame */
  resize(): boolean;
  begin(real: number): void;
  aim(w: World, aim: AimState | null, pull: PullState | null): void;
  markers(w: World, time: number): void;
  hud(w: World, coinIconX: number, alpha: number): void;
  thumbHint(): void;
  coins(real: number, tx: number): void;
  flyCoins(x: number, y: number, n: number, onEach: () => void): void;
  clearCoins(): void;
  hpPop(v: number): void;
  coinPop(): void;
  readonly coinPopValue: number;
  readonly focusReady: boolean;
  readonly t: number;
  snapHp(w: World): void;
}

export function createPainter(stage: Stage): Painter {
  const cv = el('canvas', 'ok-gfx');
  stage.overlay.appendChild(cv);
  const ctx = cv.getContext('2d')!;
  const g = new Gfx(ctx);
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  let k = 1;
  let ox = 0;
  let oy = 0;
  let skyT = 0;
  let hpShown = 1;
  let hpPop = 0;
  let coinPop = 0;
  let focusShown = 0;
  let focusReady = false;
  const flying: FlyingCoin[] = [];

  /** logical HUD space */
  const hudSpace = (): void => ctx.setTransform(dpr * k, 0, 0, dpr * k, ox * dpr, oy * dpr);
  /** logical sizes around a point given in CSS px */
  const around = (x: number, y: number): void => ctx.setTransform(dpr * k, 0, 0, dpr * k, x * dpr, y * dpr);

  function drawCoin(x: number, y: number, sx: number, sy: number): void {
    if (!COIN) return;
    g.at(x, y, sx, sy, 0, () => {
      ctx.translate(-COIN.width / 2, -COIN.height / 2);
      COIN.draw(g.phaser);
    });
  }

  return {
    get k() {
      return k;
    },
    get ox() {
      return ox;
    },
    get oy() {
      return oy;
    },
    get coinPopValue() {
      return coinPop;
    },
    get focusReady() {
      return focusReady;
    },
    get t() {
      return skyT;
    },

    resize() {
      const w = stage.root.clientWidth;
      const h = stage.root.clientHeight;
      const d = Math.min(3, window.devicePixelRatio || 1);
      if (w === cw && h === ch && d === dpr) return false;
      cw = w;
      ch = h;
      dpr = d;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      k = Math.min(w / W, h / H) || 1;
      ox = (w - W * k) / 2;
      oy = (h - H * k) / 2;
      return true;
    },

    begin(real) {
      skyT += real;
      hpPop = Math.max(0, hpPop - real * 4);
      coinPop = Math.max(0, coinPop - real * 5);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
    },

    /** Dotted arc preview (on the 3D scene, wind included) + the rubber band under the thumb (screen). */
    aim(w, aim, pull) {
      if (!aim || !pull) return;
      // rubber band from where the thumb went down
      around(pull.x0, pull.y0);
      const dx = (pull.x - pull.x0) / k;
      const dy = (pull.y - pull.y0) / k;
      g.fillStyle(PALETTE.ink, 0.35).fillCircle(0, 0, 16);
      g.fillStyle(PALETTE.white, 0.7).fillCircle(0, 0, 10);
      const shot = aim.shot;
      if (!shot) {
        g.lineStyle(3, PALETTE.white, 0.5).strokeCircle(0, 0, DRAG_DEAD);
        return;
      }
      const over = shot.power >= OVERDRAW_POWER && w.stats.overdraw > 1;
      const col = over ? PALETTE.focus : shot.power < 0.5 ? PALETTE.heal : shot.power < 0.85 ? PALETTE.coin : PALETTE.powerHigh;
      ctx.lineCap = 'round';
      g.lineStyle(12, PALETTE.ink, 0.45).lineBetween(0, 0, dx, dy);
      g.lineStyle(over ? 9 : 6, col, 0.9).lineBetween(0, 0, dx, dy);
      ctx.lineCap = 'butt';
      g.fillStyle(col, 0.9).fillCircle(dx, dy, over ? 16 : 12);
      const ang = effectiveAngle(w, shot.angle);
      const speed = arrowSpeed(shot.power);
      const o = playerOrigin(w, ang);
      const vx = Math.cos(ang) * speed;
      const vy = Math.sin(ang) * speed;
      const grav = TUNING.gravity;
      const steps = Math.round(15 * w.stats.previewMul);
      const ready = canShoot(w) || w.reload < 0.3;
      for (let i = 1; i <= steps; i++) {
        const t = i * 0.032;
        const x = o.x + vx * t + 0.5 * w.wind * t * t;
        const y = o.y + vy * t + 0.5 * grav * t * t;
        const r = 8 - (i / steps) * 4;
        const a = ready ? 1 - (i / steps) * 0.6 : 0.35;
        const s = stage.toScreen(x, y);
        around(s.x, s.y);
        g.fillStyle(PALETTE.ink, a * 0.8).fillCircle(0, 0, r + 3);
        g.fillStyle(over ? PALETTE.focus : PALETTE.white, a).fillCircle(0, 0, r);
      }
    },

    /** Health pills and "!" telegraphs over enemies, the reload ring at the bow hand (art.ts drawArcher, GameScene.render). */
    markers(w, time) {
      if (w.phase === 'cards' || w.phase === 'over') return;
      for (const a of w.enemies) {
        if (a.gone || !a.alive) continue;
        const s = a.scale;
        const hpBar = a.hp < a.maxHp;
        const telegraph = a.brain === 'draw' && a.draw > 0.15;
        if (!hpBar && !telegraph) continue;
        const p = stage.toScreen(a.body.x[PT.head]!, a.body.y[PT.head]!);
        around(p.x, p.y);
        if (hpBar) {
          const bw = 64 * s;
          const r = Math.max(0, Math.min(1, a.hp / a.maxHp));
          const top = -56 * s;
          g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-bw / 2 - 4, top - 4, bw + 8, 18, 9);
          g.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(-bw / 2, top, bw, 10, 5);
          if (r > 0) g.fillStyle(r > 0.35 ? PALETTE.heal : PALETTE.danger, 1).fillRoundedRect(-bw / 2, top, Math.max(10, bw * r), 10, 5);
        }
        if (telegraph) {
          const pulse = 1 + Math.sin(time * 20) * 0.12;
          const ty = -(hpBar ? 80 : 62) * s;
          g.fillStyle(PALETTE.ink, 1).fillCircle(0, ty, 17 * pulse);
          g.fillStyle(PALETTE.danger, 1).fillCircle(0, ty, 13 * pulse);
          g.fillStyle(PALETTE.white, 1).fillRoundedRect(-2.5, ty - 8, 5, 10, 2).fillCircle(0, ty + 6, 2.6);
        }
      }
      // reload ring around the bow hand
      const p = w.player;
      if (p.alive && w.reload > 0 && w.phase !== 'title') {
        const r = 1 - w.reload / (w.stats.reload * (w.focusT > 0 ? 0.6 : 1));
        const h = stage.toScreen(p.body.x[PT.handF]!, p.body.y[PT.handF]!);
        around(h.x, h.y);
        const end = -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, r));
        g.lineStyle(8, PALETTE.ink, 0.6).beginPath().arc(0, 0, 30, -Math.PI / 2, end, false).strokePath();
        g.lineStyle(4, w.focusT > 0 ? PALETTE.focus : PALETTE.white, 1).beginPath().arc(0, 0, 30, -Math.PI / 2, end, false).strokePath();
      }
    },

    hud(w, coinIconX, alpha) {
      hudSpace();
      ctx.globalAlpha = alpha;
      const p = w.player;
      const top = HUD.top;
      const r = Math.max(0, p.hp / p.maxHp);
      hpShown += (r - hpShown) * 0.18;
      const x = HUD.hpX;
      const bw = 210 + Math.min(80, (p.maxHp - 100) * 0.5);
      const pop = 1 + hpPop * 0.12;
      const h = 34 * pop;
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 8, top - h / 2 - 7, bw + 16, h + 14, (h + 14) / 2);
      g.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(x, top - h / 2, bw, h, h / 2);
      // white trail then the real bar
      if (hpShown > r + 0.005) g.fillStyle(PALETTE.white, 0.9).fillRoundedRect(x, top - h / 2, Math.max(h, bw * hpShown), h, h / 2);
      if (r > 0) g.fillStyle(r > 0.3 ? PALETTE.hp : PALETTE.danger, 1).fillRoundedRect(x, top - h / 2, Math.max(h, bw * r), h, h / 2);
      g.fillStyle(PALETTE.white, 0.35).fillRoundedRect(x + 8, top - h / 2 + 5, Math.max(10, bw * r - 16), h * 0.28, 4);
      // heart (the game's own; GameScene's private copy is 0.92 of it)
      const hs = 1 + hpPop * 0.3 + (r < 0.3 && p.alive ? Math.abs(Math.sin(skyT * 6.25)) * 0.15 : 0);
      drawHeart(g.phaser, x - 18, top, hs * 0.92);
      // shield bubbles left this wave
      for (let i = 0; i < w.shieldLeft; i++) {
        g.fillStyle(PALETTE.ink, 1).fillCircle(x + bw + 30 + i * 30, top, 14);
        g.fillStyle(PALETTE.bubble, 1).fillCircle(x + bw + 30 + i * 30, top, 10);
      }
      // wind sock under the coins
      if (w.wind !== 0 && w.phase !== 'title') drawWind(g.phaser, HUD.windX, HUD.windY, w.wind, skyT);
      // bonus round: time left
      const b = w.bonus;
      if (b && b.t >= 0 && b.grade === null) {
        const left = Math.max(0, b.dur - b.t);
        g.fillStyle(PALETTE.ink, 1).fillRoundedRect(HUD.bonusX - 6, HUD.bonusY - 14, 412, 28, 14);
        g.fillStyle(PALETTE.gold, 1).fillRoundedRect(HUD.bonusX, HUD.bonusY - 8, 400 * (left / b.dur), 16, 8);
      }
      const cs = 1.15 + coinPop * 0.3;
      drawCoin(coinIconX, top, cs, cs);

      // the focus meter: a gauge in the bottom-right corner
      const live = w.phase !== 'cards' && p.alive;
      focusReady = false;
      if (!live) {
        ctx.globalAlpha = 1;
        return;
      }
      const fx = HUD.focusX;
      const fy = HUD.focusY;
      focusShown += (w.focus - focusShown) * 0.2;
      const ready = w.focus >= 1 && w.focusT <= 0;
      focusReady = ready;
      const t = skyT;
      const R = 48 + (ready ? Math.sin(t * 8) * 4 : 0);
      if (ready) g.fillStyle(PALETTE.focus, 0.25 + Math.sin(t * 8) * 0.1).fillCircle(fx, fy, R + 22);
      g.fillStyle(PALETTE.ink, 0.85).fillCircle(fx, fy, R + 8);
      g.fillStyle(PALETTE.hpBack, 1).fillCircle(fx, fy, R);
      const f = w.focusT > 0 ? w.focusT / w.stats.focusTime : focusShown;
      if (f > 0.01) g.fillStyle(PALETTE.focus, 1).slice(fx, fy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f), false).fillPath();
      g.fillStyle(PALETTE.ink, 1).fillCircle(fx, fy, R * 0.55);
      // an eye: focus
      g.fillStyle(ready || w.focusT > 0 ? PALETTE.white : PALETTE.locked, 1).fillEllipse(fx, fy, R * 0.8, R * 0.46);
      g.fillStyle(PALETTE.ink, 1).fillCircle(fx, fy, R * 0.16);
      ctx.globalAlpha = 1;
    },

    /** The title's hint: a ghost thumb pulling back from open sky (GameScene.buildTitle). */
    thumbHint() {
      hudSpace();
      const phase = skyT % 1.5;
      const u = Math.min(1, phase / 0.9);
      const t = 1 - (1 - u) ** 3;
      const x0 = 300;
      const y0 = 600;
      const x = x0 - 120 * t;
      const y = y0 + 110 * t;
      g.lineStyle(10, PALETTE.ink, 0.5).lineBetween(x0, y0, x, y);
      g.lineStyle(5, PALETTE.white, 0.8).lineBetween(x0, y0, x, y);
      g.fillStyle(PALETTE.ink, 0.5).fillCircle(x0, y0, 14);
      g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, 30);
      g.fillStyle(PALETTE.white, 1).fillCircle(x, y, 24);
      g.fillStyle(PALETTE.skinShade, 1).fillCircle(x, y, 15);
    },

    /** Coins burst up from a point and home in on the counter (Fx.coins and its update). */
    flyCoins(x, y, n, onEach) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const sp = 300 + Math.random() * 380;
        flying.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, home: 0.32 + i * 0.045, onArrive: onEach });
      }
    },

    coins(real, tx) {
      if (flying.length === 0) return;
      hudSpace();
      const dt = Math.min(real, 0.05);
      const ty = HUD.top;
      for (let i = flying.length - 1; i >= 0; i--) {
        const c = flying[i]!;
        c.life += dt;
        let sc = 1;
        if (c.life > c.home) {
          const h = Math.min(1, (c.life - c.home) * 5.5);
          c.x += (tx - c.x) * h * h * 0.5;
          c.y += (ty - c.y) * h * h * 0.5;
          sc = 1 - h * 0.35;
          if ((Math.abs(tx - c.x) < 8 && Math.abs(ty - c.y) < 8) || c.life > 3) {
            flying.splice(i, 1);
            c.onArrive();
            continue;
          }
        } else {
          const d = Math.max(0, 1 - 1.2 * dt);
          c.vx *= d;
          c.vy = c.vy * d + 1400 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
        }
        drawCoin(c.x, c.y, sc * Math.abs(Math.cos(c.life * 14)) + 0.15, sc);
      }
    },

    clearCoins() {
      flying.length = 0;
    },

    hpPop(v) {
      hpPop = Math.max(hpPop, v);
    },
    coinPop() {
      coinPop = 1;
    },
    snapHp(w) {
      hpShown = Math.max(0, w.player.hp / w.player.maxHp);
      focusShown = w.focus;
    },
  };
}

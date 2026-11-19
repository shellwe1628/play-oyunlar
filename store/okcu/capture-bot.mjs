// In-page player for the 3D listing shots (apps/okcu-3d). Bundled by store/tools/lib/webapp.mjs
// and injected next to the app (the app itself is not changed). It plays the app's live world
// with the game's own scripted player: src/sim/aimbot.ts planShot with the CAREFUL profile (the
// one the balance tests and ./career.mjs use), shot through the app's own release path
// (window.__okcu3d.shoot, what a finger's release calls), cards picked by the same preference
// list through the app's Game.pickCard, the focus meter spent through Game.unleash, and time
// stepped with the app's own skip() (the sim's advance, no rendering). Nothing in the world is
// written by this file.
import { CAREFUL, planShot, solveShot } from '../../games/okcu/src/sim/aimbot.ts';
import { aliveEnemies, canShoot, targetPoint } from '../../games/okcu/src/sim/world.ts';
import { stageOf } from '../../games/okcu/src/sim/chapters.ts';
import { createRng } from '@oyun/core/pure';

const hook = () => window.__okcu3d;

/** Card index the careful player picks (career.mjs does the same). */
function prefer(offer) {
  for (const c of CAREFUL.prefer) {
    const i = offer.indexOf(c);
    if (i >= 0) return i;
  }
  return 0;
}

let rng = createRng(11);
let wait = 0;

/**
 * Play (no frames) until `stop(w)` holds. Returns { done } or { fail }. `pick: false` returns
 * at a card screen ({ cards }) instead of picking. `error` overrides the angle error.
 */
function play(stopSrc, { max = 9000, pick = true, step = 1 / 30, error = null } = {}) {
  const stop = new Function('w', 'stageOf', `return (${stopSrc})(w, stageOf)`);
  const H = hook();
  const p = error === null ? CAREFUL : { ...CAREFUL, angleError: error };
  for (let i = 0; i < max; i++) {
    const w = H.w;
    if (w.phase === 'over' || w.phase === 'dying') return { fail: `run ended on wave ${w.wave}` };
    if (stop(w, stageOf)) return { done: true, wave: w.wave };
    if (w.phase === 'cards') {
      if (!pick) return { cards: w.offer.slice() };
      H.game.pickCard(prefer(w.offer));
    }
    if (w.focus >= 1 && w.phase === 'play') H.game.unleash();
    if (canShoot(w) && (w.phase === 'title' || w.phase === 'play' || (w.phase === 'bonus' && w.bonus && w.bonus.t >= 0))) {
      wait += step;
      if (wait >= p.think || w.phase === 'title') {
        const s = planShot(w, rng, p);
        if (s && H.shoot(s.angle, s.power)) wait = 0;
      }
    }
    H.skip(step);
  }
  const w = H.w;
  return { fail: `too long: wave ${w.wave} phase ${w.phase}` };
}

/** The careful player's next shot right now (null if nothing to shoot), with a chosen error. */
function plan(error = CAREFUL.angleError) {
  const w = hook().w;
  return planShot(w, rng, { ...CAREFUL, angleError: error, powerError: error > 0 ? CAREFUL.powerError : 0 });
}

/** A clean aim (the solver's arc, no error) at the archer the careful player would pick, or at `where` of one by id. */
function aimAt(where = 'head', id = null) {
  const w = hook().w;
  const list = aliveEnemies(w).filter((a) => a.brain !== 'spawn');
  const e = (id !== null && list.find((a) => a.id === id)) || list.sort((a, b) => a.body.x[2] - b.body.x[2])[0];
  if (!e) return null;
  const pt = targetPoint(e, where);
  return { id: e.id, type: e.type, ...solveShot(w, pt.x, pt.y, CAREFUL.loft, CAREFUL.wind) };
}

window.__storeBot = {
  play,
  plan,
  aimAt,
  reseed(n) {
    rng = createRng(n);
    wait = 0;
  },
};

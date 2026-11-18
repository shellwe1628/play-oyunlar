// Staging for the Fossil Odds listing: a player's dig played headless through the game's own sim
// (src/sim/dig.ts) by the pacing test's "fast" player (tests/unit/policy.ts: 5 taps/s, glints
// after 0.6 s, the cheapest of pick / lucky charm / assistant as soon as affordable, finish a
// layer's set up to 1 in 2,000 but go deeper 4 min after the next layer opens, hold 0.8 s on hard
// veins, start an expedition as soon as it opens). The clock injected for record dates advances
// with play time. Nothing in a save is typed in by hand.

const DT = 0.1;
const SET_PATIENCE = 240;

/**
 * Play `minutes` (or until `until(sim, t)` returns true) and call `snap(sim, t)` every step; the
 * sim, its layer-open times and the elapsed seconds are returned so a later call can continue.
 */
export function playFast(mods, state, { minutes = 60, until = null, expedition = true, startMs }) {
  const { LAYERS, UPGRADE_ORDER, layerFossils } = mods;
  const sim = state.sim;
  const unlockAt = state.unlockAt;
  let hold = 0;
  let tapAcc = 0;
  let glintSeenAt = -1;
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 1; i <= steps; i++) {
    state.t += DT;
    const t = state.t;
    sim.setClock(startMs + t * 1000);
    if (sim.block.kind === 'vein') {
      hold += DT;
      if (hold >= 0.8 - 1e-9) {
        sim.charge(hold);
        hold = 0;
      }
    } else {
      hold = 0;
      tapAcc += 5 * DT;
      while (tapAcc >= 1) {
        tapAcc -= 1;
        sim.tap();
        if (sim.block.kind === 'vein') break;
      }
    }
    sim.tick(DT);
    if (sim.glint) {
      if (glintSeenAt < 0) glintSeenAt = t;
      if (t - glintSeenAt >= 0.6) {
        sim.tapGlint();
        glintSeenAt = -1;
      }
    } else glintSeenAt = -1;
    for (let l = 1; l < LAYERS.length; l++) if (unlockAt[l] === null && sim.unlocked >= l) unlockAt[l] = t;
    for (;;) {
      let best = null;
      for (const id of UPGRADE_ORDER) {
        if (id === 'offline') continue;
        const c = sim.upgradeCost(id);
        if (c === null) continue;
        if (best === null || c < sim.upgradeCost(best)) best = id;
      }
      if (best === null || !sim.buy(best)) break;
    }
    // the fast policy's choice of layer
    let want = sim.unlocked;
    for (let l = 0; l <= sim.unlocked; l++) {
      const deeperOpenFor = l < sim.unlocked ? t - (unlockAt[l + 1] ?? t) : 0;
      if (deeperOpenFor > SET_PATIENCE) continue;
      if (layerFossils(l).some((f) => f.odds <= 2000 && !sim.discovered(f.id))) {
        want = l;
        break;
      }
    }
    if (want !== sim.layer) sim.travel(want);
    if (expedition && sim.canExpedition) {
      sim.expedition();
      for (let l = 1; l < LAYERS.length; l++) unlockAt[l] = null;
    }
    if (until && until(sim, t)) return true;
  }
  return false;
}

export async function loadMods(load) {
  const { DigSim } = await load('/src/sim/dig.ts');
  const { LAYERS, UPGRADE_ORDER } = await load('/src/sim/data.ts');
  const { layerFossils } = await load('/src/sim/loot.ts');
  return { DigSim, LAYERS, UPGRADE_ORDER, layerFossils };
}

export function newCareer(mods, seed) {
  return { sim: new mods.DigSim(seed), unlockAt: mods.LAYERS.map((_, i) => (i === 0 ? 0 : null)), t: 0 };
}

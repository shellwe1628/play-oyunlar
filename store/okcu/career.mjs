// Staging for the Noodle Archers listing: a player's career played headless through the game's
// own rules. Every run is a real run of the sim (src/sim/world.ts) shot by the game's own scripted
// player (src/sim/aimbot.ts, the CAREFUL profile the balance tests use), and between runs the save
// is written by the same functions the game scene calls (meta.ts bankStart / bankProgress,
// progress.ts bankRecords / unlockFeats) and the bow is forged at the real anvil (bow.ts
// attemptForge, seeded rolls, printed chances). Nothing in the save is typed in by hand.

/** Shoot one run like aimbot.playRun does, but keep the world so it can be banked like the scene. */
function playBanked(mods, save, seed, date, difficulty = 'classic') {
  const { world, aimbot, meta, progress, core } = mods;
  const rng = core.createRng(seed * 31 + 7);
  const p = aimbot.CAREFUL;
  const w = world.createWorld({ seed, meta: meta.metaOf(save), startChapter: 0, difficulty });
  const bank = meta.newBank(save);
  w.bank = bank;
  let wait = 0;
  const step = 1 / 30;
  let lastWave = 0;
  const bankNow = () => {
    const sum = world.summarize(w, false);
    meta.bankProgress(save, bank, world.reachedWave(w), w.run.coins);
    progress.bankRecords(save, bank, sum, date);
    progress.unlockFeats(save, sum, bank);
  };
  while (w.time < 2400 && w.phase !== 'over') {
    if (w.phase === 'cards') {
      let idx = 0;
      for (const c of p.prefer) {
        const i = w.offer.indexOf(c);
        if (i >= 0) {
          idx = i;
          break;
        }
      }
      world.pickCard(w, idx);
    }
    if (w.focus >= 1) world.unleash(w);
    if (world.canShoot(w) && (w.phase === 'title' || w.phase === 'play' || (w.phase === 'bonus' && w.bonus && w.bonus.t >= 0))) {
      wait += step;
      if (wait >= p.think || w.phase === 'title') {
        const s = aimbot.planShot(w, rng, p);
        if (s && world.shoot(w, s.angle, s.power)) {
          if (!bank.started) meta.bankStart(save, bank);
          wait = 0;
        }
      }
    }
    world.advance(w, step);
    world.takeEvents(w);
    // the scene banks at every wave clear
    if (w.phase === 'clear' && w.wave !== lastWave) {
      lastWave = w.wave;
      bankNow();
    }
  }
  bankNow();
  return { reached: world.reachedWave(w), coins: w.run.coins };
}

/**
 * Play runs until the bow reaches `bowTarget` (forging after every run while the coins last, a
 * health level when the bow is out of reach, as aimbot.career does). Returns the save after the
 * run on which each bow level in `snapshots` was first reached, and (`forgeAt[level]`) the save
 * just before the forge attempt that first reached each level. `difficulty` is the enemy curve the
 * runs are played on (the 3D build, apps/okcu-3d, plays 'hard').
 */
export async function stageCareer(load, { bowTarget = 20, snapshots = [], maxRuns = 160, difficulty = 'classic' } = {}) {
  const mods = {
    world: await load('/src/sim/world.ts'),
    aimbot: await load('/src/sim/aimbot.ts'),
    meta: await load('/src/sim/meta.ts'),
    progress: await load('/src/sim/progress.ts'),
    bow: await load('/src/sim/bow.ts'),
    core: await load('@oyun/core/pure'),
  };
  const save = mods.meta.freshSave();
  const out = {};
  const forgeAt = {};
  const log = [];
  // a career that ran over the weeks before the capture date
  const day = (i) => {
    const d = new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 3)));
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < maxRuns && save.bow.level < bowTarget; i++) {
    const r = playBanked(mods, save, 5000 + i, day(i), difficulty);
    for (;;) {
      const cost = mods.bow.bowCost(save.bow.level);
      if (cost === null || save.coins < cost || save.bow.level >= bowTarget) break;
      const before = structuredClone(save);
      const res = mods.bow.attemptForge(save.bow, save);
      if (res.ok && res.success) mods.progress.unlockFeats(save, null);
      // the save just before the attempt that reached this level (a forge moment worth showing)
      if (res.ok && res.success && !forgeAt[res.level]) forgeAt[res.level] = before;
    }
    const hpCost = mods.meta.upgradeCost('hp', save.upgrades.hp);
    if (hpCost !== null && save.coins >= hpCost && (mods.bow.bowCost(save.bow.level) ?? Infinity) > save.coins * 2) mods.meta.buyUpgrade(save, 'hp');
    for (const id of ['coins', 'reroll', 'starter']) {
      const c = mods.meta.upgradeCost(id, save.upgrades[id]);
      if (c !== null && save.coins >= c * 6) mods.meta.buyUpgrade(save, id);
    }
    log.push(`run ${i + 1}: wave ${r.reached}, +${r.coins} coins, bow +${save.bow.level}, coins ${save.coins}`);
    for (const lv of snapshots) if (!out[lv] && save.bow.level >= lv) out[lv] = structuredClone(save);
  }
  // the rank ceremony has been seen on the result screens of those runs
  const settle = (s) => {
    s.rank = mods.progress.rankOf(mods.progress.progressScore(s).total);
    return s;
  };
  for (const k of Object.keys(out)) settle(out[k]);
  for (const k of Object.keys(forgeAt)) settle(forgeAt[k]);
  return { save: settle(save), at: out, forgeAt, log, mods };
}

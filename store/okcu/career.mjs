// Staging for the Noodle Archers listing: a player's career on the 3D build (apps/okcu-3d), played
// headless through the game's own rules from a fresh save. Every run is a real run of the sim
// (src/sim/world.ts, the 'hard' curve the 3D build plays) shot by the game's own scripted player
// (src/sim/aimbot.ts, the CAREFUL profile the balance tests use), with the selected weapon at its
// level (meta.ts metaOf3d). The run is banked the way the 3D app banks it (apps/okcu-3d/src/ui/
// progress.ts): bankStart with the first arrow, bankProgress / bankRecords / the first boss
// knockouts' rewards (rewards.ts grantFirstBossRewards: boss chest, the chapter's weapon) /
// unlockFeats at every wave clear and at the end, then the run-end chest (grantRunChest).
// Between runs the player does what the menus offer: claims the free chest when its 4 h timer is
// up (the wooden one, no ad), opens every chest in line (chests.ts openQueuedChest, the game's own
// seeded rolls) and spends coins and shards on the selected weapon the way the economy test's
// player does (sim/economy.ts policy: upgrade, then the day's shard offers, then a chest from the
// shop), plus a health upgrade now and then (the armour); a weapon a boss gives is taken to level 2
// (its first step costs a few coins) and looked at on the Weapons tab. Weapon reveals are taken
// (seen). Nothing
// in the save is typed in by hand, and nothing comes from the retired 2D forge.

/** Shoot one run like aimbot.playRun does, but keep the world so it can be banked like the app. */
function playBanked(mods, save, seed, date, startChapter) {
  const { world, aimbot, meta, progress, rewards, chapters, core } = mods;
  const rng = core.createRng(seed * 31 + 7);
  const p = aimbot.CAREFUL;
  const w = world.createWorld({ seed, meta: meta.metaOf3d(save), startChapter, difficulty: 'hard' });
  const bank = meta.newBank(save);
  w.bank = bank;
  let wait = 0;
  const step = 1 / 30;
  let lastWave = 0;
  const bankNow = (reached) => {
    if (!bank.started) return;
    const sum = world.summarize(w, false);
    meta.bankProgress(save, bank, reached, w.run.coins);
    const before = [...save.bosses];
    progress.bankRecords(save, bank, sum, date);
    rewards.grantFirstBossRewards(save, before);
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
    // the app banks at every wave clear
    if (w.phase === 'clear' && w.wave !== lastWave) {
      lastWave = w.wave;
      bankNow(world.reachedWave(w));
    }
  }
  bankNow(w.wave);
  if (bank.started && (w.run.shots > 0 || w.wave > chapters.chapterStart(startChapter))) rewards.grantRunChest(save, bank, w.wave, world.stagesCleared(w));
  return { reached: world.reachedWave(w), coins: w.run.coins, time: w.time };
}

/** Open every chest in line (the menu's chest pile), the game's own rolls. */
function openAll(mods, save) {
  while (mods.chests.openQueuedChest(save));
}

/** The economy test's spending policy for the selected weapon (sim/economy.ts spend). */
function spend(mods, save, dayKey) {
  const { arsenal, shop, chests } = mods;
  const id = save.arsenal.selected;
  const w = save.arsenal.weapons[id];
  const mean = (r) => (r[0] + r[1]) / 2;
  const chest = mean(chests.CHEST_ODDS.silver.shards) / shop.CHEST_PRICE.silver > mean(chests.CHEST_ODDS.gold.shards) / shop.CHEST_PRICE.gold ? 'silver' : 'gold';
  for (;;) {
    if (arsenal.upgradeWeapon(save, id)) continue;
    const cost = arsenal.upgradeCost(w.level);
    if (cost === null || w.shards >= cost.shards) return;
    const bought = shop.boughtToday(save, dayKey);
    const offers = shop
      .dailyOffers(dayKey, save)
      .map((o, i) => ({ ...o, i }))
      .filter((o) => o.weapon === id && !bought.includes(o.i) && o.coins <= save.coins)
      .sort((a, b) => b.shards - a.shards);
    if (offers.length > 0 && shop.buyOffer(save, dayKey, offers[0].i)) continue;
    if (save.coins >= shop.CHEST_PRICE[chest] + cost.coins && shop.buyChest(save, chest)) {
      openAll(mods, save);
      continue;
    }
    return;
  }
}

/**
 * Play runs from a fresh save until the bow reaches `bowTarget` and the last chapter has been
 * reached (or `maxRuns`). Each run starts at the furthest chapter reached (the chapter select's
 * choice). Returns the final save and, in `at[level]`, the save after the run on which the bow
 * first reached each level in `snapshots`.
 */
export async function stageCareer(load, { bowTarget = 10, snapshots = [], maxRuns = 300 } = {}) {
  const mods = {
    world: await load('/src/sim/world.ts'),
    aimbot: await load('/src/sim/aimbot.ts'),
    meta: await load('/src/sim/meta.ts'),
    progress: await load('/src/sim/progress.ts'),
    rewards: await load('/src/sim/rewards.ts'),
    chapters: await load('/src/sim/chapters.ts'),
    chests: await load('/src/sim/chests.ts'),
    arsenal: await load('/src/sim/arsenal.ts'),
    shop: await load('/src/sim/shop.ts'),
    core: await load('@oyun/core/pure'),
  };
  const { meta, chests, arsenal, progress, chapters } = mods;
  const save = meta.freshSave();
  const out = {};
  const log = [];
  // the career ran over the weeks before the capture: four runs a day, from 1 October 2026
  const T0 = Date.UTC(2026, 9, 1, 17);
  const dayOf = (i) => Math.floor(i / 4);
  const dateOf = (i) => new Date(T0 + dayOf(i) * 86_400_000).toISOString().slice(0, 10);
  let now = T0;
  const bow = () => save.arsenal.weapons.bow.level;
  for (let i = 0; i < maxRuns && !(bow() >= bowTarget && save.chapter >= chapters.CHAPTERS - 1); i++) {
    const date = dateOf(i);
    // a new day: the clock moves on to that evening
    now = Math.max(now, T0 + dayOf(i) * 86_400_000);
    const free = chests.claimFreeChest(save, now, false);
    if (free) save.arsenal.chests.push(free);
    openAll(mods, save);
    spend(mods, save, date);
    const start = Math.min(save.chapter, chapters.CHAPTERS - 1);
    const r = playBanked(mods, save, 5000 + i, date, start);
    now += r.time * 1000 + 60_000;
    openAll(mods, save);
    spend(mods, save, date);
    // a health level (armour) when the coins are well beyond it
    const hpCost = meta.upgradeCost('hp', save.upgrades.hp);
    if (hpCost !== null && save.coins >= 2 * hpCost) meta.buyUpgrade(save, 'hp');
    // a weapon a boss just gave: its first step up costs a few coins (arsenal.ts upgradeCost), and
    // the player looks at it on the Weapons tab
    for (const id of Object.keys(save.arsenal.weapons)) if (id !== 'bow' && save.arsenal.weapons[id].level < 2) arsenal.upgradeWeapon(save, id);
    while (arsenal.takeReveal(save));
    arsenal.markWeaponsSeen(save);
    log.push(`run ${i + 1}: ch${start + 1} wave ${r.reached}, bow ${bow()}, ch ${save.chapter}, coins ${save.coins}`);
    for (const lv of snapshots) if (!out[lv] && bow() >= lv) out[lv] = structuredClone(save);
  }
  // the rank ceremony has been seen on the result screens of those runs
  const settle = (s) => {
    s.rank = progress.rankOf(progress.progressScore(s).total);
    return s;
  };
  for (const k of Object.keys(out)) settle(out[k]);
  return { save: settle(save), at: out, log, mods };
}

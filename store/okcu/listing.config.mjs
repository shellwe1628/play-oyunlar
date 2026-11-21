// Store listing config for Noodle Archers (Sallanan Okçular). Read by store/tools/*.mjs.
//
// The Play app ships the 3D build, apps/okcu-3d: the same simulation (games/okcu/src/sim) drawn
// in side-view 3D with three.js and the Mixamo "Erika Archer" character, played on the 'hard'
// enemy curve. So the shots capture that app (`app`), built unchanged and driven through its own
// test hook `window.__okcu3d` (w, game, stage, shoot, skip).
//
// How a state is reached, honestly:
// - Saves: ./career.mjs plays a career headless with the game's own rules on the 3D build's
//   difficulty ('hard'): the CAREFUL scripted player from src/sim/aimbot.ts plays every run,
//   progress is banked with the game's own bank*/unlockFeats functions and the bow is forged at
//   the real anvil (attemptForge). The save goes into localStorage under the 3D app's key with
//   the 2D game's schema (apps/okcu-3d/src/ui/save.ts); the app moves the forged bow to its
//   weapon levels on load (sim/arsenal.ts migrateArsenal), the bosses beaten unlock their weapons.
// - Runs: a chapter is chosen like the chapter select does (Game.startRun({ chapter }), with a
//   fixed seed so the capture repeats), then played by ./capture-bot.mjs: the same CAREFUL
//   player, shooting through the app's release path (__okcu3d.shoot), picking cards through
//   Game.pickCard, time stepped with the app's skip(). If the player loses a run on the way, the
//   next seed is tried; nothing keeps the player alive and no world field is written.
// - The aiming shots are real touch drags (Chrome DevTools touch events) on the 3D stage.
// - Menus (weapons, ranks) are opened by tapping their tabs (Weapons, Ranks); the Weapons tab shows
//   the staged save's weapons (apps/okcu-3d/src/ui/weapons.ts).
import { stageCareer } from './career.mjs';

const SAVE_KEY = 'oyun:okcu-3d:save';
const SAVE_VERSION = 3;
const DRAG_DEAD = 30;
const DRAG_FULL = 300;

/** Button labels in the game's two languages (games/okcu/src/strings.ts). */
const L = {
  // the main menu's Weapons tab (apps/okcu-3d/src/ui/shell.ts → weapons.ts)
  weapons: { en: 'Weapons', tr: 'Silahlar' },
  ranks: { en: 'Ranks', tr: 'Rütbeler' },
  records: { en: 'Records', tr: 'Rekorlar' },
};

/**
 * Start a run at chapter `c` the way the chapter select does, then let the careful player play
 * until `stop(w, stageOf)` holds. A lost run is retried with the next seed.
 */
async function playTo(g, c, stop, { seed = 1, tries = 8, pick = true } = {}) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    await g.eval((H, a) => {
      H.game.startRun({ chapter: a.c, seed: a.seed });
      window.__storeBot.reseed(a.seed);
    }, { c, seed: seed + i * 101 });
    await g.run(200, 100);
    const r = await g.eval((H, a) => window.__storeBot.play(a.stop, { pick: a.pick }), { stop: stop.toString(), pick });
    if (r.done || r.cards) return r;
    last = r.fail;
  }
  throw new Error(`playTo chapter ${c}: ${last}`);
}

/** Render frames until the archers stand ready (no arrow in the air, bow nocked, enemies landed). */
async function calm(g, ms = 1200) {
  await g.run(ms, 66);
  await g.until(
    (H) => {
      const w = H.w;
      return w.phase === 'play' && w.reload === 0 && !w.arrows.some((a) => a.active && a.owner === 'player') && w.enemies.every((e) => !e.alive || e.brain !== 'spawn');
    },
    { step: 66, frame: 66, max: 15000, what: 'calm' },
  );
}

/** A real finger drag that holds the string at `aim` (angle, power). Returns a release function. */
async function holdAim(g, aim, { x0 = 470, y0 = 860, frames = 8 } = {}) {
  const pull = DRAG_DEAD + aim.power * (DRAG_FULL - DRAG_DEAD);
  const cdp = await g.page.context().newCDPSession(g.page);
  const at = (x, y) => g.eval((H, p) => H.stage.toScreen(p.x, p.y), { x, y });
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const p0 = await at(x0, y0);
  await send('touchStart', [{ ...p0, id: 1 }]);
  let last = p0;
  for (let i = 1; i <= frames; i++) {
    const k = Math.min(1, i / (frames - 2));
    last = await at(x0 - Math.cos(aim.angle) * pull * k, y0 - Math.sin(aim.angle) * pull * k);
    await send('touchMove', [{ ...last, id: 1 }]);
    await g.run(33, 33);
  }
  return async () => send('touchEnd', [{ ...last, id: 1 }]);
}

/**
 * Fire the careful player's clean shot at `where` (a real drag and release) and step frames until
 * a hit of that kind lands: the sim's own 'hit' event with its slow motion (a headshot or a weak
 * spot), read from the frame's events after the view has drawn them. A shot that lands elsewhere
 * is followed by another one, as a player would.
 */
async function shootAndLand(g, where, { after = 3, tries = 6, aimAt = where } = {}) {
  for (let n = 0; n < tries; n++) {
    await calm(g, 400);
    const aim = await g.eval((H, w) => window.__storeBot.aimAt(w), aimAt);
    if (!aim) throw new Error('nothing to shoot at');
    const release = await holdAim(g, aim, { frames: 6 });
    await release();
    for (let i = 0; i < 90; i++) {
      await g.run(33, 33);
      // the events of the frame just drawn (world.ts takeEvents keeps them in spareEvents until the next frame)
      const hit = await g.eval((H, part) => {
        const evs = H.w.spareEvents ?? [];
        if (evs.some((e) => e.t === 'hit' && e.slowmo && e.part === part)) return 'yes';
        if (evs.some((e) => e.t === 'hit') || !H.w.arrows.some((a) => a.active && a.owner === 'player')) return 'other';
        return null;
      }, where);
      if (hit === 'yes') {
        await g.run(after * 33, 33);
        return aim;
      }
      if (hit === 'other') break;
    }
  }
  throw new Error(`no ${where} hit in ${tries} shots`);
}

export default {
  slug: 'okcu',
  name: { 'en-US': 'Noodle Archers', 'tr-TR': 'Sallanan Okçular' },
  seed: 1,
  // the Play app is the 3D build; its test hook (apps/okcu-3d/src/main.ts) and the in-page player
  app: 'apps/okcu-3d',
  hook: '__okcu3d',
  bot: 'capture-bot.mjs',
  // the 3D view's world callouts (view/fx.ts) take their language from <html lang> (index.html
  // says "tr"), not from ?lang: give the page the shot's language like a phone in that language
  htmlLang: true,

  look: {
    bg: ['#2fa8f5', '#a9e6ff'],
    band: ['#ffffff', '#e6f7ff'],
    accent: '#ffb233',
    ink: '#2a1838',
    text: '#ffffff',
    pattern: 'clouds',
    stroke: 12,
    frame: '#ffffffaa',
  },

  // Icon: a drawn bow with its arrow on the game's sky, in the family frame (unchanged).
  icon: { emblem: 'bow', bg: ['#4fc3ff', '#1d6fd1'], glow: '#fff2a8', mono: true },

  async stage(load) {
    const { save, at } = await stageCareer(load, { bowTarget: 20, snapshots: [10, 16], difficulty: 'hard' });
    const wrap = (data) => ({ v: SAVE_VERSION, data });
    return {
      // after the first runs: bow +10, every chapter reached
      early: wrap(at[10]),
      // later: bow +16
      mid: wrap(at[16]),
      // the end of the career: bow +20, armour (health upgrades) maxed
      full: wrap(save),
    };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),

  shots: [
    {
      id: 'aim',
      save: 'early',
      caption: { 'en-US': 'Pull back, let go, knock them off their islands', 'tr-TR': 'Geri çek, bırak, rakipleri adalarından düşür' },
      async run(g) {
        await playTo(g, 0, (w) => w.wave >= 3 && w.phase === 'play' && w.enemies.filter((e) => e.alive).length >= 2, { seed: 3 });
        await calm(g);
        const aim = await g.eval(() => window.__storeBot.aimAt('head'));
        await holdAim(g, { angle: aim.angle - 0.05, power: aim.power * 0.92 });
        await g.run(200, 33);
      },
    },
    {
      id: 'headshot',
      save: 'mid',
      caption: { 'en-US': 'Land a headshot and watch them fly', 'tr-TR': 'Kafadan vur, rakipler uçup gitsin' },
      async run(g) {
        await playTo(g, 1, (w, stageOf) => w.wave >= 10 && w.phase === 'play', { seed: 7 });
        await calm(g);
        await shootAndLand(g, 'head', { after: 8 });
      },
    },
    {
      id: 'glow',
      save: 'full',
      caption: { 'en-US': 'Level your bow up and watch it blaze', 'tr-TR': 'Yayını geliştir, alev alev parlasın' },
      async run(g) {
        await playTo(g, 3, (w) => w.wave >= 23 && w.phase === 'play', { seed: 5 });
        await calm(g);
        const aim = await g.eval(() => window.__storeBot.aimAt('head'));
        await holdAim(g, { angle: aim.angle, power: Math.min(1, aim.power * 1.02) });
        await g.run(300, 33);
      },
    },
    {
      id: 'weapons',
      save: 'full',
      caption: { 'en-US': 'Six weapons to unlock and level up', 'tr-TR': 'Altı silahı aç, seviyesini yükselt' },
      async run(g, { lang }) {
        // the menus' DOM animations run on real time: slow them to the fake clock's pace
        await g.animRate(0.08);
        await g.run(600, 100);
        await g.tap(L.weapons[lang]);
        // the pane slides in and its cards pop: let them settle
        await g.run(1500, 100);
      },
    },
    {
      id: 'boss',
      // mid-career (bow +10), a fresh run from the chapter select up to the Desert boss
      save: 'early',
      caption: { 'en-US': 'Bosses with a weak spot and a second phase', 'tr-TR': 'Zayıf noktası ve ikinci evresi olan patronlar' },
      async run(g) {
        await playTo(g, 2, (w) => w.wave >= 21 && w.phase === 'play' && w.enemies.some((e) => e.type === 'boss' && e.alive && e.brain !== 'spawn'), { seed: 9 });
        await calm(g, 900);
        // the boss is plated everywhere; its bare head is the weak spot (ragdoll.ts BOSS_PARTS): draw on it
        const aim = await g.eval(() => window.__storeBot.aimAt('head'));
        if (aim.type !== 'boss') throw new Error(`aiming at a ${aim.type}, not the boss`);
        await holdAim(g, aim);
        await g.run(300, 33);
      },
    },
    {
      id: 'caldera',
      // the end of the career, a fresh run in the fifth world: ledges bobbing on the lava
      save: 'full',
      caption: { 'en-US': 'Six worlds, from green islands to a lava caldera', 'tr-TR': 'Yeşil adalardan lav kazanına altı dünya' },
      async run(g) {
        await playTo(g, 4, (w) => w.wave >= 31 && w.phase === 'play' && w.enemies.filter((e) => e.alive).length >= 2, { seed: 11 });
        await calm(g);
        const aim = await g.eval(() => window.__storeBot.aimAt('head'));
        await holdAim(g, { angle: aim.angle, power: aim.power * 0.95 });
        await g.run(300, 33);
      },
    },
    {
      id: 'bonus',
      save: 'full',
      caption: { 'en-US': 'Bonus rounds: shoot the floating targets', 'tr-TR': 'Bonus turları: uçan hedefleri vur' },
      async run(g) {
        await playTo(g, 0, (w) => w.phase === 'bonus' && w.bonus && w.bonus.t >= 1.5, { seed: 4 });
        await g.run(800, 66);
        // the careful player's bonus aim (it leads the flying apples), until one is struck
        for (let n = 0; n < 8; n++) {
          await g.until((H) => H.w.reload === 0, { step: 66, frame: 66, max: 4000, what: 'nocked' });
          const p = await g.eval(() => window.__storeBot.plan(0));
          if (!p) {
            await g.run(200, 66);
            continue;
          }
          await g.eval((H, s) => H.shoot(s.angle, s.power), p);
          for (let i = 0; i < 40; i++) {
            await g.run(33, 33);
            if (await g.eval((H) => (H.w.spareEvents ?? []).some((e) => e.t === 'bonusHit'))) {
              await g.run(4 * 33, 33);
              return;
            }
          }
        }
        throw new Error('no bonus hit');
      },
    },
    {
      id: 'ranks',
      save: 'full',
      caption: { 'en-US': 'Climb 14 ranks and beat your own records', 'tr-TR': '14 rütbeyi tırman, kendi rekorlarını kır' },
      async run(g, { lang }) {
        await g.run(600, 100);
        await g.tap(L.ranks[lang]);
        await g.run(1500, 100);
      },
    },
  ],

  // Feature graphic: the name and tagline beside two crops of the real 3D captures (the armoured
  // archer drawing the +20 bow at night; a headshot in the snow).
  feature: {
    tagline: { 'en-US': 'Knock them off in 3D, level up six weapons!', 'tr-TR': '3D okçuları düşür, altı silahı geliştir!' },
    cards: [
      ['glow', 0, 650, 280, 440],
      ['headshot', 300, 470, 420, 660],
    ],
  },
};

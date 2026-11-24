// Store listing config for Noodle Archers (Sallanan Okçular). Read by store/tools/*.mjs.
//
// The Play app ships the 3D build, apps/okcu-3d: the same simulation (games/okcu/src/sim) drawn
// in side-view 3D with three.js and the Mixamo "Erika Archer" character, played on the 'hard'
// enemy curve. So the shots capture that app (`app`), built unchanged and driven through its own
// test hook `window.__okcu3d` (w, game, stage, shoot, skip).
//
// How a state is reached, honestly:
// - Saves: ./career.mjs plays a career on the 3D build from a fresh save with the game's own rules
//   ('hard' curve, the selected weapon at its level): the CAREFUL scripted player from
//   src/sim/aimbot.ts plays every run, each run is banked as apps/okcu-3d/src/ui/progress.ts banks
//   it (records, boss rewards and weapons, achievements, the run-end chest), chests are opened
//   with the game's own rolls and coins and shards go to the bow (sim/economy.ts policy). The save
//   goes into localStorage under the 3D app's key. No save is migrated from the retired forge, so
//   no shot shows the one-off "welcome gift" that only migrated saves get.
// - Runs: a chapter is chosen like the chapter select does (Game.startRun({ chapter })), a mode
//   like the Events tab does (Game.startRun({ mode })), with a fixed seed so the capture repeats,
//   then played by ./capture-bot.mjs: the same CAREFUL player, shooting through the app's release
//   path (__okcu3d.shoot), picking cards through Game.pickCard, time stepped with the app's skip().
//   If the player loses a run on the way, the next seed is tried; nothing keeps the player alive
//   and no world field is written.
// - The aiming shots are real touch drags (Chrome DevTools touch events) on the 3D stage; the
//   camera angle is turned with the play HUD's own camera button.
// - Menus are opened by tapping their tabs (Weapons); a weapon is picked there like a player does
//   (its card, then Select); the free chest is opened from the Home tab's chest button.
import { stageCareer } from './career.mjs';

const SAVE_KEY = 'oyun:okcu-3d:save';
/** the save schema version of games/okcu/src/save.ts (v4: the arsenal); an older one would be migrated on load */
const SAVE_VERSION = 4;
const DRAG_DEAD = 30;
const DRAG_FULL = 300;
/** how long the chest shot lets the free chest play (ms of the fake clock): the lid off, the loot flying */
const CHEST_AT = 3800;
/** seconds of flight before the firework is caught in the air */
const ROCKET_T = 0.1;

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
async function shootAndLand(g, where, { after = 3, tries = 6, aimAt = where, type = null } = {}) {
  for (let n = 0; n < tries; n++) {
    await calm(g, 400);
    // `type`: aim at an archer of that kind (a standing archer rather than a jumper in mid-leap)
    const aim = await g.eval((H, a) => {
      const e = a.type ? H.w.enemies.find((x) => x.alive && x.brain !== 'spawn' && x.type === a.type) : null;
      return window.__storeBot.aimAt(a.where, e ? e.id : null);
    }, { where: aimAt, type });
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

/** A real tap (pointer down + up through the element's own handlers) on the element at `sel`. */
async function press(g, sel) {
  const ok = await g.page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length > 0);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    e.dispatchEvent(new PointerEvent('pointerdown', o));
    e.dispatchEvent(new PointerEvent('pointerup', o));
    return true;
  }, sel);
  if (!ok) throw new Error(`nothing to tap at ${sel}`);
}

const shown = (g, sel) => g.page.evaluate((sel) => [...document.querySelectorAll(sel)].some((x) => x.getClientRects().length > 0), sel);

/** Pick `id` on the Weapons tab like a player: its card, then "Select". */
async function selectWeapon(g, lang, id) {
  await g.tap(L.weapons[lang]);
  await g.run(1200, 100);
  await press(g, `[data-testid=weapon-card-${id}]`);
  await g.run(400, 100);
  if (await shown(g, '[data-testid=weapon-select]:not(.sel)')) await press(g, '[data-testid=weapon-select]');
  await g.run(600, 100);
  const sel = await g.eval((H) => H.game.save.data.arsenal.selected);
  if (sel !== id) throw new Error(`selected ${sel}, not ${id}`);
  // back to Home, where a drag on the stage plays (the Weapons pane would take the touches)
  await press(g, '[data-testid=tab-home]');
  await g.run(1200, 100);
}

/**
 * Fire the careful player's clean shot (a real drag and release) and step frames until the
 * player's projectile has flown `t` seconds: the shot caught in the air.
 */
async function shotInFlight(g, { t = 0.35, where = 'head', kind } = {}) {
  await calm(g);
  const aim = await g.eval((H, w) => window.__storeBot.aimAt(w), where);
  if (!aim) throw new Error('nothing to shoot at');
  // a low-gravity rocket at a near target can solve to power 0: the finger still has to leave the dead zone
  const release = await holdAim(g, { angle: aim.angle, power: Math.max(aim.power, 0.02) }, { frames: 6 });
  await release();
  for (let i = 0; ; i++) {
    if (await g.eval((H, a) => H.w.arrows.some((p) => p.active && p.owner === 'player' && p.state === 0 && p.age >= a), t)) break;
    if (i > 90) throw new Error('no projectile in flight: ' + JSON.stringify(await g.eval((H) => ({ sel: H.w.meta.weapon, phase: H.w.phase, reload: H.w.reload, arrows: H.w.arrows.filter((p) => p.active).map((p) => [p.owner, p.kind, p.state, +p.age.toFixed(2)]) }))));
    await g.run(33, 33);
  }
  const k = await g.eval((H) => H.w.arrows.find((p) => p.active && p.owner === 'player' && p.state === 0)?.kind);
  if (kind && k !== kind) throw new Error(`a ${k} in the air, not a ${kind}`);
}

/**
 * Start a mode run (Blitz, Boss Rush) as the Events tab's card does: Game.startRun({ mode }), with a
 * fixed seed so the capture repeats. The save must have the mode open (sim/modes.ts modeUnlocked).
 */
async function startMode(g, mode, seed) {
  await g.run(1000, 100);
  const ok = await g.eval((H, a) => {
    if (!H.game.save.data.runs) return 'no run on this save';
    H.game.startRun({ mode: a.mode, seed: a.seed });
    window.__storeBot.reseed(a.seed);
    return H.w.mode === a.mode ? 'ok' : `mode ${H.w.mode}`;
  }, { mode, seed });
  if (ok !== 'ok') throw new Error(`startMode ${mode}: ${ok}`);
  await g.run(400, 100);
}

/**
 * Turn the camera with the play HUD's camera button (real taps) until it shows `angle`. The button
 * is part of the play HUD: the run must have left its title phase (the first arrow starts it).
 */
async function cameraTo(g, angle) {
  await playMode(g, (w) => w.phase === 'play');
  await g.run(600, 100);
  for (let i = 0; i < 3; i++) {
    if ((await g.eval((H) => H.stage.angle)) === angle) break;
    await press(g, '[data-testid=camera]');
    await g.run(300, 33);
  }
  if ((await g.eval((H) => H.stage.angle)) !== angle) throw new Error(`camera did not reach ${angle}`);
  // the glide, and the angle's name beside the button fades out
  await g.run(1800, 100);
}

/** Let the careful player play the mode run until `stop(w)` holds. */
async function playMode(g, stop) {
  const r = await g.eval((H, a) => window.__storeBot.play(a.stop, { pick: true }), { stop: stop.toString() });
  if (!r.done) throw new Error(`playMode: ${r.fail ?? 'stopped at cards'}`);
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
    const { save, at, log } = await stageCareer(load, { bowTarget: 10, snapshots: [4, 7] });
    console.log(`[stage okcu] ${log.length} runs · ${log.at(-1)}`);
    const wrap = (data) => ({ v: SAVE_VERSION, data });
    return {
      // early in the career: bow 4, chapters 1-3 reached
      early: wrap(at[4]),
      // bow 7: every chapter reached
      mid: wrap(at[7]),
      // the end of the career: bow 10, every boss beaten (all six weapons), armour bought
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
        await playTo(g, 1, (w) => w.wave >= 10 && w.phase === 'play' && w.enemies.filter((e) => e.alive && e.brain !== 'spawn').length >= 2, { seed: 7 });
        await calm(g);
        await shootAndLand(g, 'head', { after: 8, type: 'archer' });
      },
    },
    {
      id: 'blitz',
      // Blitz in Sunset Canyon (the Events tab's card); the camera button turned to Angled
      save: 'full',
      caption: { 'en-US': 'Blitz: 60 seconds, endless archers', 'tr-TR': 'Yıldırım: 60 saniye, bitmeyen okçular' },
      async run(g) {
        await g.animRate(0.08);
        await startMode(g, 'blitz', 21);
        await cameraTo(g, 'angled');
        await playMode(g, (w) => w.phase === 'play' && w.time > 8 && w.enemies.filter((e) => e.alive && e.brain !== 'spawn').length >= 2);
        // archers keep dropping in during Blitz, so wait only for the bow to be ready again
        await g.run(300, 66);
        await g.until((H) => H.w.phase === 'play' && H.w.reload === 0 && !H.w.arrows.some((a) => a.active && a.owner === 'player'), { step: 66, frame: 66, max: 8000, what: 'bow ready' });
        const aim = await g.eval(() => window.__storeBot.aimAt('head'));
        await holdAim(g, { angle: aim.angle - 0.04, power: aim.power * 0.95 });
        await g.run(200, 33);
      },
    },
    {
      id: 'home',
      // the tabbed main menu over the live 3D scene
      save: 'full',
      caption: { 'en-US': 'Shop, weapons, ranks and events, one tap away', 'tr-TR': 'Mağaza, silahlar, rütbeler, etkinlik tek dokunuşta' },
      async run(g) {
        await g.animRate(0.08);
        await g.run(2500, 100);
      },
    },
    {
      id: 'weapons',
      save: 'full',
      caption: { 'en-US': 'Six weapons to unlock and level up', 'tr-TR': 'Altı silahı aç, seviyesini yükselt' },
      async run(g, { lang }) {
        // the menus' DOM animations run on real time: slow them to the fake clock's pace
        await g.animRate(0.08);
        await g.run(1000, 100);
        await g.tap(L.weapons[lang]);
        // the pane slides in and its cards pop: let them settle
        await g.run(2600, 100);
      },
    },
    {
      id: 'chest',
      // the free wooden chest of the 4-hour timer (every player's first one is ready at once):
      // the Home tab's chest button, then "Open"; caught while the loot flies, odds at the top
      save: 'full',
      caption: { 'en-US': 'Open chests for coins and weapon shards', 'tr-TR': 'Sandık aç, altın ve silah parçaları kazan' },
      async run(g) {
        await g.animRate(0.08);
        await g.run(1500, 100);
        await press(g, '[data-testid=shell-chest]');
        await g.run(800, 100);
        await press(g, '[data-testid=free-chest-open]');
        await g.until(() => !!document.querySelector('[data-testid=chest-screen]'), { step: 100, frame: 100, max: 5000, what: 'chest screen' });
        await g.run(CHEST_AT, 100);
      },
    },
    {
      id: 'bossrush',
      // Boss Rush in Sunset Canyon, the camera turned to Low; drawing on the first boss's weak spot
      save: 'full',
      caption: { 'en-US': 'Boss Rush: all six bosses, back to back', 'tr-TR': 'Boss Akını: altı patron art arda' },
      async run(g) {
        await g.animRate(0.08);
        await startMode(g, 'bossrush', 31);
        await cameraTo(g, 'low');
        await playMode(g, (w) => w.phase === 'play' && w.enemies.some((e) => e.type === 'boss' && e.alive && e.brain !== 'spawn'));
        await calm(g, 900);
        const aim = await g.eval(() => window.__storeBot.aimAt('head'));
        if (aim.type !== 'boss') throw new Error(`aiming at a ${aim.type}, not the boss`);
        await holdAim(g, aim);
        await g.run(300, 33);
      },
    },
    {
      id: 'firework',
      // the firework tube picked on the Weapons tab, a run in the lava caldera
      save: 'full',
      caption: { 'en-US': 'Fire a firework across the lava', 'tr-TR': 'Lavın üstünden fişek ateşle' },
      async run(g, { lang }) {
        await g.animRate(0.08);
        await g.run(1000, 100);
        await selectWeapon(g, lang, 'firework');
        await playTo(g, 4, (w) => w.wave >= 29 && w.phase === 'play' && w.enemies.filter((e) => e.alive).length >= 2, { seed: 11 });
        await shotInFlight(g, { t: ROCKET_T, kind: 'rocket' });
      },
    },
  ],

  // Feature graphic: the name and tagline beside two crops of the real 3D captures (the armoured
  // archer firing the firework tube over the lava; a headshot in the snow).
  feature: {
    tagline: { 'en-US': 'Knock them off in 3D, level up six weapons!', 'tr-TR': '3D okçuları düşür, altı silahı geliştir!' },
    cards: [
      ['firework', 70, 620, 330, 520],
      ['headshot', 150, 340, 460, 720],
    ],
  },
};

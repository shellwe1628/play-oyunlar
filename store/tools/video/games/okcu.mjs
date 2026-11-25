// Noodle Archers / Sallanan Okçular — the build that ships is the 3D one, apps/okcu-3d.
//
// Capture: apps/okcu-3d is built with its own vite config into a temp folder, with ONE
// capture-only change applied in memory (nothing in apps/ or games/ is written): main.ts also
// puts the functions it already imports (the game's own aimbot planShot / CAREFUL profile,
// canShoot, pickCard, unleash, the drag constants) on its test hook `window.__okcu3d`, so the
// recorder can play with the game's scripted player. The save is a career played headless with
// the 2D game's rules (store/okcu/career.mjs: the CAREFUL player, banked and forged by the game's
// own functions), written to the 3D build's key before the page boots. Later chapters are reached
// with the chapter select (game.startRun({chapter}), what the title's chapter pill calls) and
// played by the scripted player; the documented capture aid `god` (player hp = max = 1e6, as the
// 2D test hook's 'god') keeps it alive on the way to bosses. Aiming shots are real touch drags.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, STORE, work, launchGpu } from '../lib/env.mjs';
import { serve } from '../../lib/build.mjs';
import { withGameModules } from '../../lib/sim.mjs';
import { DOM_ANIMATION_DRIVER, Recorder } from '../lib/record.mjs';

const SAVE_KEY = 'oyun:okcu-3d:save';
const SAVE_VERSION = 3;

export const meta = {
  slug: 'okcu',
  name: { tr: 'Sallanan Okçular', en: 'Noodle Archers' },
  icon: join(STORE, 'okcu', 'icon', 'icon.svg'),
  sfx: join(REPO, 'games', 'okcu', 'src', 'sfx.ts'),
  // the game's sky and gold
  palette: { bg1: '#2fa8f5', bg2: '#0d4f9a', accent: '#ffb233', hot: '#ff5a3c', ink: '#2a1838', text: '#ffffff', glow: '#fff2a8' },
  // logical size of a recorded frame (CSS px) and the device scale: 540×960 at 2× = 1080×1920
  frame: { width: 540, height: 960 },
  music: { bpm: 120, root: 50, mode: 'major', style: 'bouncy' },
};

// ---------------------------------------------------------------- build
function exposePlugin() {
  return {
    name: 'video-expose-sim',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (!file.endsWith('/apps/okcu-3d/src/main.ts')) return null;
      const anchor = '(window as unknown as { __okcu3d: typeof hook }).__okcu3d = hook;';
      if (!code.includes(anchor)) throw new Error('okcu-3d main.ts: test hook line not found; update store/tools/video/games/okcu.mjs');
      return code.replace(anchor, `${anchor}\n  Object.assign(hook, { planShot, CAREFUL, createRng, canShoot, pickCard, unleash, DRAG_DEAD, DRAG_FULL });`);
    },
  };
}

async function buildApp() {
  const root = join(REPO, 'apps', 'okcu-3d');
  const outDir = work('build', 'okcu-3d');
  const { build } = await import('vite');
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn', plugins: [exposePlugin()], build: { outDir, emptyOutDir: true, minify: false, reportCompressedSize: false } });
  return outDir;
}

// ---------------------------------------------------------------- saves
async function stageSaves(fresh) {
  const cache = work('okcu', 'saves.json');
  if (!fresh && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const { stageCareer } = await import('../../../okcu/career.mjs');
  const res = await withGameModules('okcu', (load) => stageCareer(load, { bowTarget: 20, snapshots: [9, 14] }));
  const wrap = (data, cosmetic) => ({ v: SAVE_VERSION, data: { ...structuredClone(data), cosmetic } });
  const saves = {
    mid: wrap(res.at[9], 'feather'),
    late: wrap(res.at[14], 'tophat'),
    prism: wrap(res.save, 'crown'),
    forge20: wrap(res.forgeAt[20], 'crown'),
  };
  mkdirSync(work('okcu'), { recursive: true });
  writeFileSync(cache, JSON.stringify(saves));
  return saves;
}

// ---------------------------------------------------------------- page side
// Runs in the page after every clock step: drains the game's events into sound cues (the same
// event → preset mapping as apps/okcu-3d/src/ui/hud.ts) and lets the scripted player act.
const PAGE_SCRIPT = `
(() => {
  const SFX_OF = {
    shot: (e) => [['snap', { pitch: e.power * 3 }], ['whistle', { volume: 0.6 + e.power * 0.4, pitch: e.power * 2 }]],
    hit: (e) => [['thunk', { pitch: e.part === 'head' ? 3 : 0 }], ...(e.crit ? [['crit', {}]] : []), ...(e.slowmo ? [['ping', {}]] : [])],
    bodyThunk: () => [['thunk', { volume: 0.6, pitch: -2 }]],
    playerHit: () => [['ouch', {}], ['thunk', { volume: 0.7, pitch: -3 }]],
    blocked: () => [['bubble', {}]],
    ko: (e) => [['boing', { pitch: e.enemy === 'boss' ? -5 : 0 }]],
    loot: () => [['loot', {}]],
    poof: () => [['poof', {}]],
    thunk: (e) => [['thock', { volume: e.owner === 'player' ? 1 : 0.5 }]],
    bounce: () => [['thock', { pitch: 7 }]],
    shieldHit: (e) => [['clang', { pitch: e.broke ? -4 : 0 }]],
    plate: () => [['clang', { pitch: 4 }]],
    bomb: (e) => [['boom', { volume: e.popped ? 0.7 : 1 }]],
    barrel: () => [['boom', {}]],
    blast: () => [['boom', { volume: 0.6, pitch: 4 }]],
    orbPop: () => [['plink', {}]],
    apple: () => [['crunch', {}]],
    heal: () => [['heal', {}]],
    zap: () => [['zap', {}]],
    caught: () => [['caught', {}]],
    bossPhase: () => [['roar', {}]],
    summon: () => [['summon', {}]],
    rope: () => [['snapRope', {}]],
    rockBreak: () => [['crumble', { volume: 0.8 }]],
    multi: (e) => [['stinger', { pitch: e.n * 2 }]],
    streak: (e) => [['stinger', { pitch: Math.min(12, e.n / 2) }]],
    chain: (e) => [['ping', { pitch: Math.min(12, e.n * 2) }]],
    focus: (e) => (e.on ? [['focus', {}]] : []),
    enemyShot: () => [['enemySnap', {}]],
    bonusStart: () => [['@win', { volume: 0.6 }]],
    bonusHit: (e) => [[e.bull ? 'ping' : 'tick', { pitch: e.bull ? 4 : 6 }]],
    bonusEnd: (e) => (e.grade !== 'none' ? [['fanfare', {}]] : []),
    waveClear: () => [['@win', { volume: 0.7 }]],
    dying: () => [['@lose', {}]],
  };
  const pending = [];
  const bot = { on: false, think: 0.6, wait: 0, god: false, unleash: true, cardWait: 1.4, cardT: 0, rng: null };
  window.__vbot = bot;
  function wrap(H) {
    if (H.__wrapped) return;
    H.__wrapped = true;
    const orig = H.stage.render.bind(H.stage);
    H.stage.render = (f) => {
      for (const e of f.events) {
        pending.push({ type: e.t, ...(e.t === 'hit' ? { part: e.part, slowmo: !!e.slowmo } : {}), ...(e.t === 'ko' ? { enemy: e.enemy, cause: e.cause } : {}) });
        const m = SFX_OF[e.t];
        if (m) for (const [name, o] of m(e)) pending.push({ sfx: name, ...o });
      }
      orig(f);
    };
  }
  const pickIndex = (w, prefer) => {
    for (const c of prefer) { const i = w.offer.indexOf(c); if (i >= 0) return i; }
    return 0;
  };
  // one decision of the scripted player for dt seconds of game time
  window.__vact = (dt, live) => {
    const H = window.__okcu3d;
    const w = H.w;
    if (bot.god && w.player.alive && (w.player.hp < 1e5 || w.player.hp !== w.player.maxHp)) w.player.maxHp = w.player.hp = 1e6;
    if (!bot.on) return;
    bot.rng = bot.rng || H.createRng(11);
    if (w.phase === 'cards') {
      bot.cardT += dt;
      if (bot.cardT >= (live ? bot.cardWait : 0)) { H.pickCard(w, pickIndex(w, H.CAREFUL.prefer)); bot.cardT = 0; }
      return;
    }
    bot.cardT = 0;
    if (bot.unleash && w.focus >= 1 && w.focusT <= 0 && w.phase === 'play') H.unleash(w);
    const can = H.canShoot(w) && (w.phase === 'title' || w.phase === 'play' || (w.phase === 'bonus' && w.bonus && w.bonus.t >= 0));
    if (!can) return;
    bot.wait += dt;
    if (bot.wait < bot.think && w.phase !== 'title') return;
    const plan = H.planShot(w, bot.rng, H.CAREFUL);
    if (plan) { H.shoot(plan.angle, plan.power); bot.wait = 0; }
    else if (w.phase === 'title') { H.shoot(-0.5, 0.6); bot.wait = 0; }
  };
  window.__vstep = (dtMs) => {
    const H = window.__okcu3d;
    if (!H || !H.ready) return null;
    wrap(H);
    window.__vact(dtMs / 1000, true);
    // menus and card picks are marked so the edit's busiest-window search keeps away from them
    const ph = H.w.phase;
    if (ph === 'cards' || ph === 'over' || ph === 'title' || H.game.paused) pending.push({ type: 'calm', phase: ph });
    return pending.splice(0);
  };
  /** Play without drawing (the game's own skip: advance + drop events) until stop(w) or max seconds. */
  window.__vfast = (stopSrc, max, arg) => {
    const H = window.__okcu3d;
    const stop = new Function('w', 'arg', 'return (' + stopSrc + ')(w, arg)');
    for (let t = 0; t < max; t += 1 / 30) {
      const w = H.w;
      if (stop(w, arg)) return { ok: true, wave: w.wave, phase: w.phase };
      if (w.phase === 'over') return { ok: false, wave: w.wave, phase: w.phase };
      window.__vact(1 / 30, false);
      H.skip(1 / 30);
    }
    const w = H.w;
    return { ok: false, timeout: true, wave: w.wave, phase: w.phase };
  };
})();
`;

async function open(browser, server, { save, lang, seed = 5 }) {
  const context = await browser.newContext({ viewport: meta.frame, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(
    ({ key, save }) => {
      if (sessionStorage.getItem('__v_seeded')) return;
      sessionStorage.setItem('__v_seeded', '1');
      localStorage.clear();
      if (save) localStorage.setItem(key, JSON.stringify(save));
      localStorage.setItem('oyun:okcu-3d:audio', JSON.stringify({ muted: true, music: 1, sfx: 1 }));
    },
    { key: SAVE_KEY, save },
  );
  await page.addInitScript(DOM_ANIMATION_DRIVER);
  await page.addInitScript(PAGE_SCRIPT);
  const T0 = new Date('2026-11-18T17:00:00Z').getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.goto(`${server.url}?seed=${seed}&lang=${lang}`);
  for (let i = 0; ; i++) {
    if (await page.evaluate(() => window.__okcu3d?.ready === true)) break;
    if (i > 1200) throw new Error('okcu-3d did not become ready');
    await page.clock.fastForward(50);
    await new Promise((r) => setTimeout(r, 15));
  }
  return { page, context, errors };
}

const bot = (page, patch) => page.evaluate((p) => Object.assign(window.__vbot, p), patch);
const W_ = (page, fn) => page.evaluate(`(${fn})(window.__okcu3d.w)`);
async function fast(page, stop, max = 600, arg = null) {
  const r = await page.evaluate(([s, m, a]) => window.__vfast(s, m, a), [stop.toString(), max, arg]);
  if (!r.ok) throw new Error(`fast play did not reach the state (${JSON.stringify(r)}) for ${stop}`);
  return r;
}

/** Real finger drag: press, pull back along the aim over `ms`, settle on the planned shot, let go. */
async function dragShot(page, rec, { ms = 900, hold = 260, release = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const H = await page.evaluate(() => {
    const H = window.__okcu3d;
    return { dead: H.DRAG_DEAD, full: H.DRAG_FULL };
  });
  const plan = async () => page.evaluate(() => {
    const H = window.__okcu3d;
    return H.planShot(H.w, H.createRng(Math.floor(H.w.time * 1000)), H.CAREFUL);
  });
  let p = await plan();
  if (!p) throw new Error('dragShot: no target');
  // the press point (logical px): lower middle of the screen, where a thumb rests
  const x0 = 440;
  const y0 = 900;
  const toCss = async (lx, ly) => page.evaluate(([x, y]) => window.__okcu3d.stage.toScreen(x, y), [lx, ly]).catch(() => null);
  const css = async (lx, ly) => (await toCss(lx, ly)) ?? { x: lx * 0.75, y: ly * 0.75 };
  const at = async (angle, power) => {
    const len = H.dead + power * (H.full - H.dead);
    return css(x0 - Math.cos(angle) * len, y0 - Math.sin(angle) * len);
  };
  const s = await css(x0, y0);
  await send('touchStart', [{ x: s.x, y: s.y, id: 1 }]);
  const n = Math.round(ms / 33);
  for (let i = 1; i <= n; i++) {
    const k = 1 - (1 - i / n) ** 3; // ease out: quick pull, slow settle
    const q = await at(p.angle + (1 - k) * 0.25, p.power * (0.25 + 0.75 * k));
    await send('touchMove', [{ x: q.x, y: q.y, id: 1 }]);
    await rec.run(1000 / 30);
  }
  for (let i = 0; i < Math.round(hold / 33); i++) {
    p = (await plan()) ?? p; // follow a moving target like a person would
    const q = await at(p.angle, p.power);
    await send('touchMove', [{ x: q.x, y: q.y, id: 1 }]);
    await rec.run(1000 / 30);
  }
  if (!release) return { send, at, p };
  const q = await at(p.angle, p.power);
  rec.mark('release');
  await send('touchEnd', [{ x: q.x, y: q.y, id: 1 }]);
  await cdp.detach();
  return p;
}

const hasEvent = (m, test, from = 0) => m.events.some((e) => e.t >= from && test(e));

// ---------------------------------------------------------------- clips
const CLIPS = {
  /** the hook: a real drag with the dotted arc, release, a headshot (the game's own slow motion) */
  async aim(ctx) {
    const { page, rec } = await ctx.open('mid');
    await bot(page, { on: true, god: true });
    await fast(page, (w) => w.wave >= 2 && w.phase === 'play' && w.reload <= 0 && w.enemies.filter((e) => e.alive).length >= 2);
    for (let attempt = 0; attempt < 10; attempt++) {
      await bot(page, { on: false });
      await rec.skip(700);
      rec.start('aim');
      await rec.run(300);
      await dragShot(page, rec, { ms: 800, hold: 300 });
      await rec.run(3200);
      const m = rec.end();
      if (hasEvent(m, (e) => e.type === 'hit' && e.part === 'head' && e.slowmo, m.marks.release)) return;
      ctx.log(`aim: attempt ${attempt + 1} had no headshot knockout, again`);
      await bot(page, { on: true });
      await fast(page, (w) => w.phase === 'play' && w.reload <= 0 && w.enemies.some((e) => e.alive) && w.time > 0, 60);
    }
    throw new Error('aim: no headshot in 10 tries');
  },

  /** ragdolls: the scripted player clears a meadow stage with barrels */
  async ragdoll(ctx) {
    const { page, rec } = await ctx.open('late');
    await bot(page, { on: true, god: true, think: 0.45 });
    await fast(page, (w) => w.wave >= 5 && w.phase === 'play');
    await rec.skip(1500);
    rec.start('ragdoll');
    await rec.run(9000);
    rec.end();
  },

  /** the four worlds: a stretch of play in each chapter, reached with the chapter select */
  async worlds(ctx) {
    for (const c of [0, 1, 2, 3]) {
      const { page, rec } = await ctx.open('prism');
      await page.evaluate((c) => window.__okcu3d.game.startRun({ chapter: c }), c);
      await rec.skip(600);
      await bot(page, { on: true, god: true, think: 0.5 });
      const wave = c * 7 + 2;
      await fast(page, (w, wave) => w.wave >= wave && w.phase === 'play', 900, wave);
      await rec.skip(1500);
      rec.start(`world${c}`);
      await rec.run(4500);
      rec.end();
      await ctx.close();
    }
  },

  /** desert stage 6: two ledges swinging on ropes */
  async swing(ctx) {
    const { page, rec } = await ctx.open('prism');
    await page.evaluate(() => window.__okcu3d.game.startRun({ chapter: 2 }));
    await rec.skip(600);
    await bot(page, { on: true, god: true, think: 0.7 });
    await fast(page, (w) => w.wave >= 20 && w.phase === 'play', 1200);
    await rec.skip(1200);
    rec.start('swing');
    await rec.run(7000);
    rec.end();
  },

  /** a boss with its weak spot, its knockout, then the chapter's bonus round */
  async boss(ctx) {
    const { page, rec } = await ctx.open('late');
    await page.evaluate(() => window.__okcu3d.game.startRun({ chapter: 1 }));
    await rec.skip(600);
    await bot(page, { on: true, god: true, think: 0.6 });
    await fast(page, (w) => w.wave >= 14 && w.phase === 'play' && w.enemies.some((e) => e.type === 'boss' && e.alive), 1500);
    await rec.skip(300);
    rec.start('boss');
    for (let i = 0; i < 30 * 40; i++) {
      await rec.run(1000 / 30);
      if (i % 15 === 0 && (await W_(page, (w) => w.phase === 'clear' || w.phase === 'bonus' || w.phase === 'cards'))) break;
    }
    await rec.run(1500);
    rec.end();
    await rec.until(() => W_(page, (w) => w.phase === 'bonus' && w.bonus && w.bonus.t >= -0.5), { max: 20000, what: 'bonus' });
    rec.start('bonus');
    await rec.run(7000);
    rec.end();
  },

  /** the card pick between stages */
  async cards(ctx) {
    const { page, rec } = await ctx.open('late');
    await bot(page, { on: true, god: true, cardWait: 2.6 });
    await fast(page, (w) => w.wave >= 3 && w.phase === 'clear', 900);
    rec.start('cards');
    await rec.until(() => W_(page, (w) => w.phase === 'cards'), { max: 8000, what: 'cards' });
    rec.mark('cards');
    await rec.run(3600);
    rec.end();
  },

  /** the forge: the save from just before the attempt that reached +20 (seeded rolls: it succeeds) */
  async forge(ctx) {
    const { page, rec } = await ctx.open('forge20');
    await rec.skip(800);
    await page.locator('.ok-btn', { hasText: ctx.lang === 'tr' ? 'Demirci' : 'Forge' }).first().click();
    await rec.skip(900);
    rec.start('forge');
    await rec.run(500);
    rec.mark('press');
    const btns = page.locator('.ok-btn');
    const n = await btns.count();
    let clicked = false;
    for (let i = 0; i < n && !clicked; i++) {
      const b = btns.nth(i);
      const txt = (await b.textContent()) ?? '';
      if (/^\s*(Döv|Forge) \d/.test(txt) && (await b.isVisible())) {
        await b.click();
        clicked = true;
      }
    }
    if (!clicked) throw new Error('forge button not found');
    await rec.run(5200);
    rec.end();
    const lv = await page.evaluate(() => window.__okcu3d.game.save.data.bow.level);
    if (lv !== 20) throw new Error(`forge: bow is +${lv}, expected +20`);
  },

  /** the forged +20 bow in play (rainbow glow) and armour from the health upgrades */
  async glow(ctx) {
    const { page, rec } = await ctx.open('prism');
    await page.evaluate(() => window.__okcu3d.game.startRun({ chapter: 3 }));
    await rec.skip(600);
    await bot(page, { on: true, god: true, think: 0.6 });
    await fast(page, (w) => w.wave >= 24 && w.phase === 'play', 1500);
    await rec.skip(1500);
    await bot(page, { on: false });
    rec.start('glow');
    await rec.run(400);
    await dragShot(page, rec, { ms: 900, hold: 500 });
    await rec.run(2500);
    rec.end();
  },

  /** ranks and records */
  async ranks(ctx) {
    const { page, rec } = await ctx.open('prism');
    await rec.skip(800);
    await page.locator('.ok-btn', { hasText: ctx.lang === 'tr' ? 'Rütbe' : 'Ranks' }).first().click();
    rec.start('ranks');
    await rec.run(2600);
    rec.end();
  },
};

export async function record({ lang, root, only, log, fresh }) {
  log('okcu: staging the career (games/okcu sim, CAREFUL player)');
  const saves = await stageSaves(fresh);
  log('okcu: building apps/okcu-3d');
  const dir = await buildApp();
  const server = await serve(dir);
  const browser = await launchGpu();
  const problems = [];
  try {
    for (const [id, fn] of Object.entries(CLIPS)) {
      if (only && !only.includes(id)) continue;
      let cur = null;
      const ctx = {
        lang,
        log,
        async open(saveName) {
          await ctx.close();
          const o = await open(browser, server, { save: saves[saveName], lang });
          cur = o;
          return { ...o, rec: new Recorder(o.page, root) };
        },
        async close() {
          if (cur) {
            const errs = cur.errors.filter((e) => !/WebGL|GPU stall|favicon/i.test(e));
            if (errs.length) problems.push(`${id}: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
            await cur.context.close();
            cur = null;
          }
        },
      };
      const t = Date.now();
      try {
        await fn(ctx);
        log(`okcu ${lang}: clip ${id} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return problems;
}

// ---------------------------------------------------------------- the edit
/** How much a recorded event is worth when the edit looks for the busiest window of a clip. */
export function scoreEvent(e) {
  if (e.type === 'calm') return -6;
  if (e.type === 'ko') return e.enemy === 'boss' ? 8 : 3;
  if (e.type === 'hit') return e.part === 'head' ? 2 : e.part === 'weak' ? 3 : 1;
  if (e.type === 'barrel' || e.type === 'bomb' || e.type === 'multi') return 3;
  if (e.type === 'bonusHit' || e.type === 'apple') return 1;
  return 0;
}
/** Camera shake on the big moments. */
export function shakeOn(e) {
  if (e.type === 'barrel' || e.type === 'bomb') return 0.5;
  if (e.type === 'ko') return e.enemy === 'boss' ? 0.7 : 0.25;
  if (e.type === 'hit' && e.slowmo) return 0.35;
  return 0;
}

const TXT = {
  tr: {
    aim: 'Geri çek, *nişan al*…', go: '…ve *bırak!*', rag: 'Rakipleri *platformdan* düşür', ragK: 'Ragdoll fizik',
    worlds: '*4 dünya* seni bekliyor', w: ['Çayır', 'Kar', 'Çöl', 'Gece'], swing: '*Sallanan* ve kayan adalar',
    boss: 'Zayıf noktası olan *patronlar*', bossK: 'Bölüm sonu', bonus: '*Bonus* turları', cards: 'Her aşamada bir *kart* seç',
    forge: 'Yayını *+20*’ye kadar döv', forgeK: 'Demirci', glow: '*Gökkuşağı* yay ve zırh', ranks: '*Rütbeler* ve rekorlar',
    soon: 'Yakında: *sıralama sistemi!*', sub: 'Dünya sıralaması yakında', stamp: 'YAKINDA',
  },
  en: {
    aim: 'Pull back, *aim*…', go: '…and *let go!*', rag: 'Knock them *off their ledges*', ragK: 'Ragdoll physics',
    worlds: '*4 worlds* to fight through', w: ['Meadow', 'Snow', 'Desert', 'Night'], swing: '*Swinging* and sliding islands',
    boss: '*Bosses* with weak spots', bossK: 'Boss fight', bonus: '*Bonus* rounds', cards: 'Pick a *card* every stage',
    forge: 'Forge your bow to *+20*', forgeK: 'The forge', glow: '*Rainbow* bow and armour', ranks: '*Ranks* and records',
    soon: 'Leaderboards *coming soon!*', sub: 'Global rankings on the way', stamp: 'SOON',
  },
};

export function edit(lang) {
  const T = TXT[lang];
  const auto = (min = 0.8) => ({ auto: true, min });
  return {
    beats: [
      { clip: 'aim', from: 0.2, dur: 1.5, caption: T.aim, pos: 'top', zoom: [1.1, 1.0], focus: [0.35, 0.6] },
      { clip: 'aim', from: ['release', 0.45], dur: 2.5, caption: T.go, pos: 'top', trans: 'punch', zoom: [1.12, 1.02], focus: [0.5, 0.45] },
      { clip: 'ragdoll', from: auto(0.5), dur: 3.0, caption: T.rag, kicker: T.ragK, pos: 'bottom', trans: 'whip' },
      ...[0, 1, 2, 3].map((c) => ({ clip: `world${c}`, from: auto(1), dur: 1.0, caption: T.worlds, kicker: T.w[c], pos: 'bottom', trans: c ? 'flash' : 'whip', dir: -1, zoom: [1.0, 1.08] })),
      { clip: 'swing', from: auto(0.5), dur: 2.5, caption: T.swing, pos: 'bottom', trans: 'whip' },
      { clip: 'boss', from: auto(0.3), dur: 3.0, caption: T.boss, kicker: T.bossK, pos: 'bottom', trans: 'punch' },
      { clip: 'bonus', from: 1.0, dur: 2.0, caption: T.bonus, pos: 'bottom', trans: 'whip', dir: -1, zoom: [1.0, 1.06] },
      { clip: 'cards', from: ['cards', -0.15], dur: 2.5, caption: T.cards, pos: 'bottom', capY: 1520, trans: 'zoom', zoom: [1.0, 1.04] },
      { clip: 'forge', from: ['press', -0.1], dur: 3.5, speed: [[0, 1.4], [1.1, 1.4], [1.4, 1]], caption: T.forge, pos: 'bottom', capY: 1560, trans: 'punch', zoom: [1.0, 1.1], focus: [0.5, 0.4] },
      { clip: 'glow', from: ['release', -1.0], dur: 2.5, caption: T.glow, pos: 'bottom', trans: 'flash', zoom: [1.08, 1.0], focus: [0.25, 0.65] },
      { clip: 'ranks', from: 0.3, dur: 2.0, caption: T.ranks, pos: 'bottom', trans: 'whip', zoom: [1.0, 1.05] },
    ],
    end: { dur: 5.0, stampAt: 2.1 },
    endCard: { soon: T.soon, sub: T.sub, stamp: T.stamp },
  };
}

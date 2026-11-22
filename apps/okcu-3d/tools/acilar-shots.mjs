/* global window */
// Camera angles (src/view/angles.ts, src/view/stage.ts): screenshots of the same frozen moment on
// every angle, and the numbers that show the gameplay plane does not move.
//
//   node tools/acilar-shots.mjs shots   --chapters 0,1,2,3,4,5 --stage 3
//   node tools/acilar-shots.mjs measure --chapters 0,5
//   node tools/acilar-shots.mjs button  --lang tr
//   node tools/acilar-shots.mjs cine
//
// shots    per chapter: the world stepped to a stage and frozen (?speed=0), a bow drawn and held,
//          then one capture per angle. Only the angle differs between the three pictures.
//          --query "a=b&c=d" adds URL switches (e.g. "weapon=spear" or the mode switch of a new arena),
//          --wave N uses that wave instead of chapter × 7 + stage, --name sets the file prefix.
// measure  on a frozen frame with reduced motion (angle changes cut): a grid of logical points
//          through stage.toScreen on every angle (the difference to Side, CSS px), the round trip
//          toLogical(toScreen(p)) (logical px), where the backdrop's meshes land compared to Side
//          (the shear keeps them put), and the same round trip sampled during a glide.
// button   the HUD's camera button in a live run: tapped twice (captures with the angle's name up),
//          then the page is reloaded without ?angle= to show the choice was remembered; also the
//          title (where the button must be away) and a drag started on the button (must not aim).
//          --lang tr|en
// cine     the two cinematic swings on the Angled angle: a boss's entrance (the aim bot clears the
//          stage before a boss stage, --wave, default 6, at ?speed=3; the trace starts as the boss
//          drops in) and a boss's knockout (a staged 'ko' event). Prints the eye offset over time
//          (metres at the resting distance; side 0,0) and takes captures, then checks the guards:
//          a drag held (no swing starts), a drag begun mid-swing (it lets go) and ?calm=1 (no
//          swing, and an angle change is a cut).
// --base   the dev server (default http://localhost:5333/)      --out  folder (default tools/out-acilar)
// --size   WxH (default 540x960)      --dpr  device pixel ratio (default 1)      --clip  x,y,w,h viewport px to crop (shots)
// One browser, closed at the end. Headless WebGL is software-rendered: judge looks, not frame rate.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const [cmd = 'shots', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []));
const base = args.base ?? 'http://localhost:5333/';
const out = resolve(args.out ?? 'tools/out-acilar');
const [vw, vh] = (args.size ?? '540x960').split('x').map(Number);
const ANGLES = ['side', 'angled', 'low'];
const clip = args.clip ? args.clip.split(',').map(Number) : null;
const shotOpts = clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {};
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(args.dpr ?? 1) });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(`${base}?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__okcu3d?.ready === true, null, { timeout: 90_000 });
  return page;
}
/** wait for `n` rendered frames */
const frames = (page, n) => page.evaluate((count) => new Promise((done) => {
  const g = window.__okcu3d;
  const from = g.frames;
  const tick = () => (g.frames - from >= count ? done(null) : setTimeout(tick, 30));
  tick();
}), n);
const waveOf = (chapter) => Number(args.wave ?? chapter * 7 + Number(args.stage ?? 3));
/** the eye offset in use, read back from the backdrop's shear (stage.ts: shear = eye / REST_DIST) */
const eyeOf = (page) => page.evaluate(() => {
  const g = window.__okcu3d;
  const m = g.stage.scene.getObjectByName('okcu-backdrop-shear').matrix.elements;
  const rest = 8 / Math.tan((11 * Math.PI) / 180);
  return [+(m[8] * rest).toFixed(2), +(m[9] * rest).toFixed(2)];
});
/** follow the eye for `ms`, with captures at the given times (ms) */
async function follow(page, ms, name, shotsAt = []) {
  const t0 = Date.now();
  const track = [];
  let next = 0;
  while (Date.now() - t0 < ms) {
    const e = await eyeOf(page);
    track.push(`${((Date.now() - t0) / 1000).toFixed(2)}s ${e[0]},${e[1]}`);
    if (next < shotsAt.length && Date.now() - t0 >= shotsAt[next]) {
      const file = `${out}/${name}-${next}.png`;
      await page.screenshot({ path: file });
      console.log(file);
      next += 1;
    }
    await page.waitForTimeout(70);
  }
  return track;
}
const stageKo = (page) => page.evaluate(() => {
  const g = window.__okcu3d;
  const boss = g.w.enemies.find((e) => e.type === 'boss');
  if (!boss) return false;
  g.w.events.push({ t: 'ko', id: -1, x: boss.anchorX, y: boss.anchorY - 90, cause: 'arrow', coins: 0, enemy: 'boss' });
  return true;
});
const extra = args.query ? `&${args.query}` : '';

try {
  if (cmd === 'shots') {
    for (const chapter of (args.chapters ?? '0,1,2,3,4,5').split(',').map(Number)) {
      const page = await open(`seed=5&lang=en&chapter=${chapter}&wave=${waveOf(chapter)}&speed=0&angle=side${extra}`);
      // let the wave land, then hold a drawn bow (the aim preview) through the three captures
      await page.evaluate(() => window.__okcu3d.skip(2.2));
      await frames(page, 3);
      await page.mouse.move(vw * 0.62, vh * 0.5);
      await page.mouse.down();
      await page.mouse.move(vw * 0.3, vh * 0.72, { steps: 6 });
      for (const angle of ANGLES) {
        await page.evaluate((a) => window.__okcu3d.stage.setAngle(a), angle);
        await page.waitForTimeout(900);
        await frames(page, 3);
        const file = `${out}/${args.name ?? `ch${chapter}`}-${angle}.png`;
        await page.screenshot({ path: file, ...shotOpts });
        console.log(file);
      }
      await page.mouse.up();
      const state = await page.evaluate(() => {
        const g = window.__okcu3d;
        return { theme: g.w.theme, wave: g.w.wave, span: g.w.span, phase: g.w.phase, failures: Object.fromEntries(g.failures) };
      });
      console.log(JSON.stringify(state));
      await page.close();
    }
  } else if (cmd === 'measure') {
    for (const chapter of (args.chapters ?? '0,5').split(',').map(Number)) {
      const page = await open(`seed=5&lang=en&chapter=${chapter}&wave=${waveOf(chapter)}&speed=0&calm=1&angle=side${extra}`);
      await page.evaluate(() => window.__okcu3d.skip(2.2));
      await frames(page, 3);
      // freeze the camera too (its sway runs on real time): paused frames carry real = 0
      await page.evaluate(() => window.__okcu3d.game.setPaused(true));
      await frames(page, 3);
      const sample = () => page.evaluate(() => {
        const g = window.__okcu3d;
        const r = g.stage.root.getBoundingClientRect();
        const pts = [];
        let trip = 0;
        for (let x = -200; x <= 1100; x += 130) {
          for (let y = -300; y <= 1500; y += 150) {
            const s = g.stage.toScreen(x, y);
            const b = g.stage.toLogical(r.left + s.x, r.top + s.y);
            trip = Math.max(trip, Math.hypot(b.x - x, b.y - y));
            pts.push(s);
          }
        }
        const c = g.stage.camera.position;
        // the backdrop's meshes (their origins sit at every layer depth), where the camera puts them
        const back = [];
        const v = c.clone();
        g.stage.scene.getObjectByName('okcu-backdrop')?.traverse((o) => {
          if (!o.isMesh || !o.visible) return;
          v.setFromMatrixPosition(o.matrixWorld).project(g.stage.camera);
          back.push({ x: (v.x * 0.5 + 0.5) * r.width, y: (0.5 - v.y * 0.5) * r.height, z: Math.round(-o.matrixWorld.elements[14]) });
        });
        return { pts, back, trip, eye: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), span: g.w.span };
      });
      const side = await sample();
      for (const angle of ANGLES) {
        await page.evaluate((a) => window.__okcu3d.stage.setAngle(a), angle);
        await frames(page, 3);
        const now = await sample();
        const moved = Math.max(...now.pts.map((p, i) => Math.hypot(p.x - side.pts[i].x, p.y - side.pts[i].y)));
        const backMoved = now.back.length === side.back.length ? Math.max(0, ...now.back.map((p, i) => Math.hypot(p.x - side.back[i].x, p.y - side.back[i].y))) : NaN;
        const depths = [...new Set(now.back.map((p) => p.z))].sort((a, b) => a - b);
        console.log(JSON.stringify({ chapter, span: now.span, angle, eye: now.eye, points: now.pts.length, planeMovedCssPx: +moved.toExponential(2), roundTripLogicalPx: +now.trip.toExponential(2), backdropMeshes: now.back.length, backdropDepthsM: `${depths[0]} … ${depths[depths.length - 1]}`, backdropMovedCssPx: +backMoved.toExponential(2) }));
      }
      await page.close();
    }
    // the round trip while the eye is moving (a glide in a live, unpaused frame)
    const page = await open(`seed=5&lang=en&chapter=2&wave=${waveOf(2)}&auto=1&angle=side${extra}`);
    await page.waitForTimeout(2500);
    let worst = 0;
    const eyes = [];
    for (const angle of ['angled', 'low', 'side']) {
      await page.evaluate((a) => window.__okcu3d.stage.setAngle(a), angle);
      for (let i = 0; i < 6; i++) {
        await frames(page, 1);
        const r = await page.evaluate(() => {
          const g = window.__okcu3d;
          const box = g.stage.root.getBoundingClientRect();
          let trip = 0;
          for (let x = 0; x <= 720; x += 90) {
            for (let y = 0; y <= 1280; y += 160) {
              const s = g.stage.toScreen(x, y);
              const b = g.stage.toLogical(box.left + s.x, box.top + s.y);
              trip = Math.max(trip, Math.hypot(b.x - x, b.y - y));
            }
          }
          return { trip, ex: +g.stage.camera.position.x.toFixed(2), ey: +g.stage.camera.position.y.toFixed(2) };
        });
        worst = Math.max(worst, r.trip);
        eyes.push(`${r.ex},${r.ey}`);
      }
    }
    console.log(JSON.stringify({ live: true, samples: eyes.length, roundTripLogicalPx: +worst.toExponential(2), eyes }));
    await page.close();
  } else if (cmd === 'button') {
    const lang = args.lang ?? 'en';
    const query = `seed=5&lang=${lang}&auto=1&wave=${args.wave ?? 2}${extra}`;
    const page = await open(query);
    await page.evaluate(() => window.localStorage.removeItem('oyun:okcu-3d:angle'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__okcu3d?.ready === true, null, { timeout: 90_000 });
    await page.waitForTimeout(1500);
    const btn = page.locator('[data-testid="camera"]');
    const box = await btn.boundingBox();
    const state = () => page.evaluate(() => ({ angle: window.__okcu3d.stage.angle, stored: window.localStorage.getItem('oyun:okcu-3d:angle'), aim: window.__okcu3d.w.player.draw }));
    console.log(JSON.stringify({ step: 'start', box, ...(await state()) }));
    for (let i = 0; i < 2; i++) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(700);
      const file = `${out}/button-${lang}-${i + 1}.png`;
      await page.screenshot({ path: file });
      console.log(file, JSON.stringify(await state()));
    }
    // a press that starts on the button and drags away must not draw the bow
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 150, box.y + 260, { steps: 5 });
    const held = await page.evaluate(() => window.__okcu3d.game.w.player.draw);
    await page.mouse.up();
    console.log(JSON.stringify({ step: 'drag from the button', bowDrawn: held, ...(await state()) }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__okcu3d?.ready === true, null, { timeout: 90_000 });
    console.log(JSON.stringify({ step: 'after reload', ...(await state()) }));
    await page.close();
    // the title: no camera button there
    const title = await open(`seed=5&lang=${lang}${extra}`);
    await title.waitForTimeout(1500);
    console.log(JSON.stringify({ step: 'title', phase: await title.evaluate(() => window.__okcu3d.w.phase), buttonShown: await title.locator('[data-testid="camera"]').isVisible() }));
    await title.close();
  } else if (cmd === 'cine') {
    const wave = Number(args.wave ?? 6);
    const page = await open(`seed=5&lang=en&wave=${wave}&auto=1&speed=3&angle=angled${extra}`);
    await page.waitForFunction(() => window.__okcu3d.w.enemies.some((e) => e.type === 'boss'), null, { timeout: 240_000, polling: 30 });
    console.log(JSON.stringify({ step: 'entrance', wave: await page.evaluate(() => window.__okcu3d.w.wave) }));
    console.log((await follow(page, 3000, 'cine-entrance', [700, 1900])).join(' | '));
    // the knockout: once for the trace, once more for the captures (a capture takes longer than a frame)
    await page.waitForTimeout(600);
    console.log(JSON.stringify({ step: 'knockout', staged: await stageKo(page) }));
    console.log((await follow(page, 2200, 'x')).join(' | '));
    await stageKo(page);
    await follow(page, 2200, 'cine-knockout', [150, 900]);
    // guards: no swing while a shot is aimed; a shot aimed mid-swing lets go of it
    await page.mouse.move(vw * 0.62, vh * 0.5);
    await page.mouse.down();
    await page.mouse.move(vw * 0.3, vh * 0.72, { steps: 6 });
    await frames(page, 2);
    await stageKo(page);
    console.log(`aiming, then a knockout: ${(await follow(page, 900, 'x')).join(' | ')}`);
    await page.mouse.up();
    await page.waitForTimeout(900);
    await stageKo(page);
    await frames(page, 3);
    const before = await eyeOf(page);
    await page.mouse.move(vw * 0.62, vh * 0.5);
    await page.mouse.down();
    await page.mouse.move(vw * 0.3, vh * 0.72, { steps: 6 });
    console.log(`a knockout, then aiming (eye was ${before}): ${(await follow(page, 1100, 'x')).join(' | ')}`);
    await page.mouse.up();
    await page.close();
    // reduced motion: no swing at a knockout, and an angle change is a cut
    const calm = await open(`seed=5&lang=en&wave=7&angle=angled&calm=1${extra}`);
    await calm.waitForTimeout(3000);
    await frames(calm, 2);
    console.log(`calm knockout (staged: ${await stageKo(calm)}): ${(await follow(calm, 1300, 'x')).join(' | ')}`);
    await calm.evaluate(() => window.__okcu3d.stage.setAngle('low'));
    await frames(calm, 1);
    console.log(`calm, one frame after setAngle('low'): ${await eyeOf(calm)}`);
    await calm.close();
  } else console.log(`unknown command ${cmd}`);
  if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 12).join('\n')}`);
} finally {
  await browser.close();
}

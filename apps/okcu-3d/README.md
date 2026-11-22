# Sallanan Okçular 3D (`apps/okcu-3d`)

The existing game `games/okcu` drawn in side-view 3D. **The rules are not copied**: this app
imports the simulation straight from `games/okcu/src/sim` (aliases `@sim/*`, and `@okcu/*` for
other Phaser-free files of the game) and only replaces the drawing (three.js instead of Phaser).
The goal is the same game, same feel, same information on screen, in 3D with Mixamo characters.

## Run and check

```text
npm run dev -w apps/okcu-3d          # http://localhost:5180 (usually already running; do not start a second one, do not stop it)
npx tsc -p apps/okcu-3d/tsconfig.json   # typecheck (strict, noUncheckedIndexedAccess)
cd apps/okcu-3d && node tools/shot.mjs --url "http://localhost:5180/?seed=5&auto=1" --out shots/x --at 2,6
```

`tools/shot.mjs` takes headless screenshots (software WebGL, so judge looks, not frame rate) and
prints module failures and console errors; read its header for `--eval`, `--clip`, `--size`.
`tools/cila-shots.mjs` captures the menus' motion moments (a level-up, coins flying to the counter, the
result card, the tabs arriving) frozen at exact times into `tools/out-cila/`; `src/ui/juice.ts` holds the
shared motion pieces they show. `tools/cila-play.mjs` takes a burst of in-play frames from the moment a
condition on the world turns true (its header shows how to push an event into `w.events` to stage a moment).
URL switches are listed at the top of `src/main.ts` (`seed`, `wave`, `chapter`, `bow`, `armor`,
`auto`, `off`, `speed`, `angle`). `window.__okcu3d` exposes `w` (the world), `game`, `stage`, `shoot()`,
`skip()`.

Camera angles (`src/view/angles.ts`, applied in `src/view/stage.ts`): Side, Angled and Low are eye
offsets of the lens-shift camera, so the gameplay plane, `toScreen` / `toLogical` and the DOM overlay
are the same on all three; the HUD's camera button (top left in play) cycles them and the choice is
kept in localStorage (`oyun:okcu-3d:angle`), `?angle=side|angled|low` overrides it. The backdrop is
authored for the Side eye, so the stage shears its root group (`okcu-backdrop`) against the eye
offset and it looks the same on every angle; a new backdrop layer needs nothing extra as long as
it hangs under that root. `tools/acilar-shots.mjs` takes the same frozen moment on every angle
(`shots`), prints how far the plane moved between angles and the `toLogical(toScreen(p))` round
trip (`measure`), exercises the button (`button`) and stages the two cinematic swings (`cine`),
into `tools/out-acilar/`.

Modes (the Events tab, `src/ui/events.ts`): **Blitz** and **Boss Rush**. Their rules, numbers and
what a mode run may write to the save are the simulation's (`games/okcu/src/sim/modes.ts`,
`createWorld({ mode })`, tests in `games/okcu/tests/unit/modes.test.ts` and `modes-3d.test.ts`); the
app only starts them (`Game.startRun({ mode })`, `Game.mode`), draws the Blitz clock and score in
the HUD, and shows the result card with the mode's score and best (`RunResult.mode`). They are
played on a seventh arena theme that is in no chapter, Sunset Canyon (`src/view/arena/themes.ts`:
the arena's theme tables are the game's six plus this one; views pick the theme by `w.theme`,
never by the wave). `?mode=blitz|bossrush` opens a mode directly as a test run (the save is left
alone), `?mode=bossrush&boss=N` (1 … 6) starts the rush at that boss, and `window.__okcu3d.bot(true)`
turns the aim bot on after the page has loaded. `tools/modlar-shots.mjs` plays both modes from the
Events tab on a seeded save and captures the cards, the clock, the result cards and the arena
(`--angle angled|low`, `--lang tr`) into `tools/out-modlar/`.

The 2D game is the reference for how everything should look and move:
`npm run dev -w games/okcu -- --port 5173` runs it if you want reference screenshots.

## Layout and ownership

| File | What |
|---|---|
| `src/main.ts` | world, clock, drag → shot mapping, module wiring, test hook |
| `src/contract.ts` | the interfaces between parts (`Stage`, `Frame`, `Module`, `ArchersView`, `BowHandle`, `FxView`, `Game`) |
| `src/coords.ts` | simulation px ↔ scene metres. Always convert through it |
| `src/assets.ts` | loads the Mixamo FBX files from `public/assets` |
| `src/view/stage.ts` | renderer, camera, lights, shadows, shake, screen mapping, camera angles |
| `src/view/angles.ts` | the camera angles' eye offsets, glide and cinematic swing, the lens-shift maths (pure) |
| `src/view/arena.ts` | sky and backdrop per theme, ledges, walls, movers and ropes, props, plates, targets, apples |
| `src/view/arena/themes.ts` | the arena themes: the game's six worlds and the modes' Sunset Canyon |
| `src/view/archers.ts`, `src/view/rig.ts` | Mixamo characters driven by the ragdoll points; bows, helmets, shields, armour |
| `src/view/arrows.ts` | arrows, bombs, orbs, trails |
| `src/view/fx.ts` | event effects, damage numbers, slow motion, shake requests |
| `src/view/bowglow.ts` | the bow's glow by level |
| `src/ui/*` | DOM HUD, title, cards, result, aim line, sound |

## Conventions

- Simulation units: logical px, portrait 720 × 1280, y down; angles in that frame. Scene: metres,
  y up, 80 px = 1 m, the logical frame centred on the origin in the plane z = 0. Gameplay happens
  in that plane; depth (z) is only for looks.
- Modules read the world and the frame's events; only `Game` methods change the world.
- The world object is replaced on restart: never keep references to it, its archers or arrows
  across frames; key your pooled objects by `archer.id` / array index and drop the ones that vanish.
- Lint rules of the repo apply: no `any`, `import { type X }` for types, no `console.log`
  (`console.warn` / `console.error` are allowed).
- Target is a phone: pool objects, share geometries and materials, avoid per-frame allocation in
  hot loops, keep shadow-casting lights to one.

## Assets

`public/assets/*.fbx` come from Mixamo (character "Erika Archer With Bow/Arrow"; clips Standing
Aim Idle 01, Standing Idle 01, Standing Draw Arrow, Standing Aim Recoil, Standing Death
Backward 01). Read Mixamo's licence terms before publishing a build that contains them.

## Test APK

Built by the shared test pipeline (`tools/apk.mjs`, see `apps/test-paketi/README.md`):
`npm run apk -- okcu3d` gives its own test app `com.playoyunlar.noodlearchers3d.test` with the
in-app updater, and the bundle `npm run apk` carries it as the `okcu3d` card. The pipeline also
runs on Windows (JDK 21 + Android SDK via JAVA_HOME / ANDROID_HOME).

## Not verified

Never run on a phone. Not part of `npm run gate`.

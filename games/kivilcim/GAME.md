# Sparkrise (TR: Kıvılcım) — concept

Slug `kivilcim` · portrait 720×1280 · genre: one-touch reflex arcade

## Why this game exists

The owner played the first batch on a phone: the two slow, thinking-heavy games were
"very bad", the fast tapping one was fine. They asked for games in the style of
CrazyGames' hits. The single most-voted single-player game on the site is a
one-button "hold to rise, release to fall" corridor flyer (6M votes). This is an
original game in that genre, turned ninety degrees so it suits one thumb on a
phone held upright.

**The bar: fun inside the first ten seconds.** If a tester is not dodging within
three seconds of opening the game and retrying within one second of dying, the
build has failed, whatever the tests say.

## Pitch

A spark races up a neon shaft. Hold to veer right, let go to veer left. Thread the
zigzag, grab the gems, do not touch the walls.

## Core loop

- The spark always climbs. Its path is a pure zigzag: while the screen is held it
  travels up-right at 45°, otherwise up-left at 45°. No inertia, no gravity — the
  direction changes the instant the finger goes down or up. The whole screen is the
  button.
- The shaft scrolls down toward the player. Walls, spike blocks and moving bars form
  a corridor. Any contact is death: the spark shatters, the screen kicks, and a tap
  restarts the level at once (no menu, no countdown longer than a beat).
- Three gems per level sit on riskier lines. A level is 35–50 seconds long. Progress
  is shown as a percentage; the best percentage is kept and shown on death, so every
  attempt says "you got further".
- Gates change the rules mid-level: **fast** / **slow** (scroll speed), **mini**
  (the spark shrinks and the corridor tightens), **flip** (held = left, released =
  right, until the next flip gate). Each gate is introduced alone in an easy stretch
  before it is combined.

## Modes and content for the vertical slice

- **Levels 1–10**, each with its own colour scheme and a hand-ordered sequence of
  seeded pattern segments (straights, steps, slaloms, pinches, bar rhythms), so
  difficulty rises on purpose rather than by chance. Level 1 must be finishable by a
  first-time player within about five attempts; level 10 should take a good player
  dozens. Levels unlock in order.
- **Endless** (unlocked after level 3): segments are drawn at random from a rising
  difficulty pool, speed creeps up, best height is saved.
- **Skins**: eight spark shapes and eight trail colours bought with gems. Purely
  cosmetic; shown on the menu so there is always something to want.
- **Daily shaft**: one seeded endless run per calendar date, best of the day, streak.

## Feel (this is most of the game)

- Bright and loud, not dark and sparse: saturated two-colour gradients that shift
  with progress, glowing walls, a long ribbon trail behind the spark that draws the
  zigzag you flew.
- A driving synthesized beat (kick, bass, arp) generated in code and tied to scroll
  speed; background shapes pulse on the beat. Gates land on the beat where possible.
- Near misses (passing within a few pixels of a wall) throw sparks and a rising tick;
  consecutive near misses raise a short-lived "edge" combo that only awards style
  points and bigger effects.
- Death: 60–90 ms freeze, shatter into shards in the spark's colour, screen kick,
  low thud; the level is playable again within 600 ms. An attempt counter ticks up.
- Finishing a level: slow-motion burst through a ring, percentage slams to 100,
  gems fly into the counter.
- Haptics through the platform interface on death, gate and finish.

## Flow

App open → title with a big pulsing "tap to play" → the last unlocked level starts
immediately. Level select, endless, daily and skins are one tap away from the title
but never in the way. After death: tap = retry. After a finish: next level starts
on tap. No interstitial between a death and a retry.

## Sim (pure, in `src/sim/`)

Fixed-step and deterministic (a fixed tick, independent of frame rate), so the same
seed and the same input timeline always give the same run:
`buildLevel(id)` / `buildEndless(seed)` → geometry (wall polylines, blocks, moving
bars, gates, gems); `RunSim(level)` with `step(held)`, position, speed, size, flip
state, progress, gems taken, near-miss detection, death cause.

Unit tests must cover: direction changes on the exact tick input changes; collision
with walls, blocks and moving bars including at mini size; each gate's effect and its
end; gems collected only by overlap; progress reaches exactly 100 % at the finish
ring; determinism; **every level 1–10 is completable** — a search-based autopilot
finds an input timeline that finishes it, with a stated safety margin in pixels and a
minimum reaction window in milliseconds per level, and those two numbers get
strictly harder from level 1 to level 10; all three gems of every level are
reachable on a finishing run; endless segments never produce an impossible join at
any speed over a large seeded sample.

## Test hook

`state()`: mode, level, progress, alive, attempts, gems, speed, size, flipped.
`act('hold', boolean)`, `act('autopilot', boolean)` (replays the solver's timeline),
`act('start', {mode, level})`. The smoke test finishes level 1 on autopilot, dies by
never touching, retries, and checks the retry was playable within 600 ms. A separate
test plays with real touch only: it presses and releases following the solver's
timeline and must get past 30 % of level 1, then dies and retries by tap.

## Monetisation hooks (interface only, no provider)

Rewarded: "continue from here" once per attempt on levels (resume at the last gate
passed); double gems after a finish. Interstitial: at most once every three finished
levels, never between a death and a retry.

## Out of scope for the slice

Level editor, online leaderboards, more than ten levels, music tracks beyond the
generated beat.

---

## Built (vertical slice)

### What exists

- **One scene for the whole loop** (`src/scenes/GameScene.ts`): the title is drawn over the live
  shaft; the first press anywhere starts level N (last unlocked) in the same frame, with that
  finger already steering right. Death → 80 ms freeze → shatter (shards, sparks, camera kick
  1.07→1, thud, heavy haptic) → card with %, a this-attempt-vs-best bar, best, attempt, style →
  any press from 260 ms restarts **in the same frame** (no scene change, no fade, no menu).
  Finish → ring burst, confetti, 100 % slam, slow-motion coast → card (+gems, style, rewarded
  "double gems") → press → next level (interstitial at most every 3rd finished level, never
  after a death).
- **Levels 1-10**, **Endless** (unlocks after level 3; speed creeps 480→650 px/s; palette changes
  every 600 m), **Daily shaft** (seeded from the local date, best of the day, streak),
  **Level select** (`LevelsScene`), **Skins** (`SkinsScene`: 8 spark shapes × 8 trails, gem
  prices 4-32, live preview). Rewarded "continue from the last gate" once per attempt (resumes
  from an exact `RunSim.clone()` snapshot taken at the gate).
- **Sim** (`src/sim/`, pure, 120 Hz): `TrackBuilder` (corridor = centre + half-width polyline,
  diamond spike blocks, moving bars, gates on the beat grid, gems), `RunSim` (exact signed
  distances: polyline walls, rotated-square blocks, capsule bars), pattern library
  (`patterns.ts`: open, wide, wave, zig, needle, slalom, bars, steps, rhythm; every pattern runs
  port-to-port), `levels.ts`, `endless.ts`, `solver.ts`, `progress.ts`, `skins.ts`, `music.ts`.
- **Solver**: forward DP over (tick, 2-px x-bin, input held) keeping one exact representative per
  bin, so plans replay bit-for-bit in `RunSim`; minimum-hold constraint on presses/releases;
  optional gem constraint and forced first input. Exact distance is evaluated only where the
  cheap Lipschitz bound is inconclusive.
- **Render**: walls/blocks/beat lines baked into 720×512 canvas chunks (4 permanent start chunks
  so a retry never bakes, a pool of 6 recycled chunks, at most one bake per frame); pooled
  sprites for gems/bars/gates/finish; one `Graphics` ribbon trail from a 160-point ring buffer;
  Phaser particle emitters (pooled) for embers, near-miss sparks, shards, stars, confetti;
  backdrop = 2 tinted quads + 7 pulsing outline shapes + 14 speed streaks. Letterbox areas of
  the page wear the level's wall stripes (CSS on `body`).
- **Input** (`src/input/HoldInput.ts`): raw window pointer events, per-pointer tracking, union of
  fingers = held; pointerup/pointercancel/lostpointercapture release; `touchend`/`touchcancel`
  with no touches left clears all touch pointers; blur / tab-hide clear; Space/Up/W on desktop.
  Presses on visible buttons are left to the UI.
- **Audio**: step sequencer (`src/audio/Music.ts` + `src/sim/music.ts`) on core's music bus:
  kick, offbeat hat, pumping saw bass, square arp, clap; 4-bar minor progression per theme;
  layers enter with progress / edge combo. **Steps are positions in the shaft** (one beat =
  256 px of climb), so tempo follows scroll speed exactly (470 px/s ≈ 110 BPM, fast gate at
  600 px/s ≈ 194 BPM) and gates (snapped to the 256-px grid) land on a kick. Background shapes,
  spark glow, gem/gate glows and the % counter pulse on the same grid (minus output latency).
  SFX: near-miss tick rising with the edge combo, gem chime rising per gem, gate whoosh, death
  thud, finish fanfare, "past your best" chime.

### Tuning numbers

- Tick 120 Hz. Spark radius 13 px (mini 7.5); drawn at ~34 px (visual larger than hitbox).
  Lateral speed = scroll speed (45°). Gates: fast ×1.38, slow ×0.72.
- Level base speeds (px/s): 470, 485, 500, 510, 525, 540, 555, 570, 585, 600.
- Port (every join): centre 360, half-width 170. Walls stay ≥ 26 px inside the screen.
- Near miss: clearance < 10 px, released above 16 px; edge combo window 2 s; style += 10 × edge.
- Corridor half-widths by pattern difficulty q (0→1): zig 118→50, needle 92→33, wave 165→110,
  steps 150→92, rhythm 120→72; mini stretches ×0.6. Slalom gap 190→74, bars swing period
  2.8→1.8 s. Bars are phased from the exact crossing time to swing aside on alternate sides.
- Each level has an explicit crux three quarters in: a needle at `CRUX_Q`
  (0.08 … 0.93) sets the margin, a rhythm zigzag with leg `RHYTHM_LEG` (256 … 142 px) sets the
  window; a wide breather precedes it (without it the two forced turns coupled across the join
  and the window collapsed).

Solver table (`tests/unit/levels.test.ts` prints it; margin = largest clearance a finishing
plan keeps everywhere with every press/release ≥ 100 ms; window = largest minimum press/release
duration of any finishing plan):

| Level | Length | Margin | Window | Speed |
|---|---|---|---|---|
| 1 | 44.2 s | 47.46 px | 591.7 ms | 470 |
| 2 | 46.6 s | 43.75 px | 541.7 ms | 485 |
| 3 | 44.5 s | 39.84 px | 491.7 ms | 500 |
| 4 | 48.3 s | 35.55 px | 441.7 ms | 510 |
| 5 | 45.9 s | 32.23 px | 400.0 ms | 525 |
| 6 | 48.4 s | 28.32 px | 358.3 ms | 540 |
| 7 | 46.3 s | 25.20 px | 325.0 ms | 555 |
| 8 | 43.9 s | 20.90 px | 300.0 ms | 570 |
| 9 | 43.8 s | 16.41 px | 275.0 ms | 585 |
| 10 | 40.6 s | 13.09 px | 258.3 ms | 600 |

Both columns are strictly decreasing (tested). All ten levels finish on the solver's timeline,
and all three gems of every level are taken on a finishing run (tested). Endless: 40 seeds × 14
segments solved at creeping, constant-minimum and constant-maximum speed, plus 8 deep runs
(segments 30-45) at maximum speed — no failure (tested).

### Measured

- Retry (smoke test, measured inside the page from the death): tap accepted 282 ms after
  death, run restarted at 282 ms, sim advancing at 403 ms (≤ 600 ms required).
- Own JavaScript per frame while playing (this scene's `update`: sim ticks, shaft, trail,
  backdrop, music, HUD): avg 1.34 ms, p95 8.0 ms, max 10.8 ms. Whole Phaser step + render
  submission: avg 3.7 ms, p95 12.9 ms. Measured headless on a shared, software-rendered build
  machine at ~10 fps (load average 5-12); p95 includes frames that bake a wall chunk.
- Autopilot plan computed in the page: ~0.3-0.45 s (once per level).
- Bundle: JS 383 KB gz of 550, total 1521 KB.

### Deviations from the concept, and why

- **No separate menu or result scene.** The title, ready prompt, death card and finish card are
  overlays of the game scene, so there is never a scene transition between the player and a
  run. Level select and skins are separate scenes one tap from the title. The core "result
  screen" contract is met by the in-scene finish card.
- **The run starts on the first press** (title, retry, ready) and that press steers right; there
  is no idle scroll before it. A first-time player is dodging within a second of the first tap.
- **Speed/size/flip gates end on explicit gates** (`normal`, `big`, a second `flip`), and every
  level and endless segment closes its own effects.
- **Endless "best height"** is shown in metres (y / 10).
- **Hit-stop is used only on death** (80 ms); gates use a camera zoom punch instead, so steering
  is never frozen mid-run.
- **Gradient art is canvas-drawn** (`src/render/canvasArt.ts`, wall chunks) rather than
  `TextureRecipe`s, because Graphics recipes cannot draw gradients.
- **Phaser touchcancel fix** (`src/input/touchCancelFix.ts`): Phaser 4.2.1 calls
  `preventDefault()` on non-cancelable touchcancel events, which Chrome logs as a console error.
- **Real-touch test uses the Playwright clock.** On this machine a CDP touch takes 0.3-1 s to
  reach the page and frames take ~200 ms while the spark crosses half the shaft in 0.6 s, so the
  test fakes rAF/timers/performance.now and steps game time, sending real CDP touches between
  frames. It proves: press starts the run and steers right; release steers left; 18 real
  switches following the solver timeline reach 31.6 % of level 1; two fingers / lifting one /
  touchcancel never leave the spark stuck; a real tap retries. It does not measure real-time
  latency. The two long e2e tests have 600 s timeouts because the machine is shared.

### Candidates for core

- A music step sequencer driven by a position (not a clock) on the music bus.
- Canvas texture recipes (gradients) next to Graphics recipes.
- The Phaser touchcancel `cancelable` check (core boots Phaser).
- A whole-screen hold input with per-pointer bookkeeping (`HoldInput`) for one-touch games.
- Letterbox styling hook (page background behind `Scale.FIT`).

### Unfinished / not verified

- Not heard: the audio mix was never listened to here (no audio device); levels were not
  played by a human. Not run on a real phone: frame time, haptics and audio latency are
  unmeasured on hardware.
- Rendering interpolates the spark between ticks (≤ 8 ms visual lag) for smoothness on 90/120 Hz
  screens; a press is applied to all ticks of the next frame.

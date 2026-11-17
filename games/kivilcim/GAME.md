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
  shaft; the first press anywhere starts level N (last unlocked) at that press, and the press is
  the run's first input edge. Death → 80 ms freeze → shatter (shards, sparks, camera kick, thud,
  heavy haptic) → card with %, a this-attempt-vs-best bar, best, attempt, style → any press from
  260 ms restarts (no scene change, no fade, no menu). Finish → ring burst, confetti, 100 % slam,
  slow-motion coast → card (+gems, style, rewarded "double gems" with a confirmation) → press →
  next level (interstitial at most every 3rd finished level, never after a death; one advance per
  finish, however many taps). Pause → core's menu → "tap to continue": the run resumes on the
  player's press and that press is the hold.
- **Levels 1-10**, **Endless** (unlocks after level 3; speed creeps 480→650 px/s; grows ahead of
  the spark — a longer build of the same seed is swapped in, never a finish), **Daily shaft**
  (seeded by local date; its own best; each gem of the day pays once per date), **Level select**
  (locked cards shake and say "finish level N first"), **Skins** (8 shapes × 8 trails, the first
  trail costs 3 gems = level 1's gems). Rewarded "continue from the last gate" once per attempt
  (exact `RunSim.clone()` snapshot; stale ad callbacks are ignored).
- **Launch**: every run starts at 20 % speed and reaches full speed after 800 px of climb, inside
  a full-width chamber: nothing can kill in the first ~1.6 s whatever the input (tested for all
  levels and endless). On the very first run a big "← LET GO!" appears as the first wall
  approaches, then "HOLD! →" for the other side; then never again (saved).
- **Gates**: fast / slow / 1× speed, mini / big, flip / unflip. Flip has a two-way-chevron
  purple band; the return is its own calm mint band "NORMAL" / "DÜZ" with "Controls back to
  normal". While flipped, a "⇄ FLIPPED" tag rides under the spark. Banners sit in the top band
  under the HUD, ~0.6 s, out of the flight path; edge-combo text sits under the spark.
- **Input** (`src/input/HoldInput.ts` + `src/sim/input.ts`): window pointer events, union of
  fingers, every lost-finger path cleared. Each press/release is queued with its event time and
  applied from the first tick whose end time is at or after it; one edge per tick, so a tap
  shorter than a tick still gives one held tick. The run clock is real elapsed time
  (`performance.now()` through core's `realTimeDelta`, capped at 100 ms per frame for players,
  200 ms under automation) — Phaser's smoothed delta is not used, so the first seconds after
  load/refocus run at real speed. No tick of a run comes from before its start press.
- **Sim** (`src/sim/`, pure, 120 Hz): builder, patterns, levels, endless, run, solver, human
  model, progress, skins, music, input queue.
- **Solver**: forward DP over (tick, 2-px bin, input), exact replay, minimum hold, gems, forced
  first input, planning from a mid-run state (`from`), a windowed `prepare` (endless autopilot
  plans 6 s ahead and re-plans every 3 s), and a "comfort" objective (max sum of capped
  clearance minus a per-switch cost = the line a person flies).
- **Human model** (`src/sim/human.ts`): flies the comfort line; commits each input change
  250 ms ahead from the offset it sees then (accounting for changes already committed); each
  change lands with uniform ±40 ms noise. It finishes every level with zero noise (tested).
- **Render**: wall chunks baked once; pooled sprites/particles; one trail Graphics. Drawn
  hazards are within a few px of the lethal ones: bars 2 px outside the capsule, block teeth
  4 px past the diamond, edges' solid stroke 3 px; bars are drawn at the spark's interpolated
  time.
- **Audio**: step sequencer on core's music bus, steps = positions in the shaft (tempo follows
  speed; gates on the 256-px beat grid land on a kick).
- **Level worlds** (`src/render/World.ts`, `worldArt.ts`): each level/theme has a motif (rays,
  circuit, aurora, rain, hex, tunnel, waves, grid, bokeh, embers): two parallax tile layers,
  flowing ribbons and a pool of 22 motif sprites (rise/fall/drift/radiate/twinkle/travel),
  all pumping on the beat and speeding up with speed gates. Baked once per load; Float32Array
  state, no per-frame allocation. Endless steps through the motifs with height and marks every
  250 m with a line, banner, chime and haptic.
- **Walls** (`src/render/EdgeFx.ts`): one additive Graphics: a beat pulse along both edges, a
  travelling highlight per wall, and up to 6 ripples that run along the wall from a near miss.
- **Objects**: gems spin, glint and swell/lean toward an approaching spark; bars carry a sliding
  glint and glow pulse; blocks have a rotating aura; each gate kind moves its own way (fast tiles
  rush, slow tiles crawl, flip oscillates, mini/big bands pulse), crossed gates dim; the finish
  shows rings and beams building over its last 1600 px. Lethal shapes did not change.
- **Spark and skins**: idle motion per shape (pulse, spin, fast spin, wiggle, 60° beat steps,
  breathe, flicker), squash on turns, a charge-up of converging sparks/halos in the start
  chamber, a different shatter per shape (shard texture, speed, gravity, count), and 8 trail
  behaviours (ribbon, sparks with falling embers, pixels, comet, dots, lightning, helix, rainbow).
- **Screens**: title logo with gradient, shine sweep and beat bounce, and a demo spark zigzagging
  with the chosen trail; level select cards carry their world's scrolling motif (locked cards
  dimmed in their own colours); death card slides in and counts up (retry still at 260 ms);
  finish card has rotating rays behind 100 %; the FINISH label bursts up out of the spark's way.
- **HUD band**: a gradient shade under the HUD; gate and finish labels fade as they enter it
  (hazards stay drawn).
- **`?fx=0`** turns off the new presentation (worlds, wall fx, trail styles, demo spark); the
  scene keeps a running hash of sim state (`simHash` in the test hook) for the presentation test.

- **Content round: 40 levels in 4 worlds** (`src/sim/levels.ts`, `patterns.ts`): world 1 is the
  original ten (geometry frozen; a test replays the old and new code bit for bit). Worlds 2-4 add
  eight mechanics, each introduced alone at q 0 on its own level with a one-time cue: split paths
  (islands, gem in the narrow branch, L11), lasers blinking on the beat in a checkerboard (L13),
  spinners (L16), wind zones that bend the 45° line (L21), moving walls / pistons (L23), dark
  sections lit around the spark (L26, presentation only), portal pairs (L31), mirror twin (L34).
  Levels 20/30/40 are boss finales (a code-drawn eye in the backdrop, HP bar, cracks per cleared
  section, "boss down" at the finish). The sim stays pure: new hazards are in `sdf`, wind and
  portals in `RunSim.step` and the solver's transition, so the solver and human model cover them.
- **Stars** (finish, all 3 gems in one finished run, no near miss) and **star-gated worlds**
  (15 / 36 / 60 stars); 2 gems per new star, world clear bonus 20/30/40/50.
- **Trail collection** (`src/sim/skins.ts`, `render/Trail.ts`): 22 trails in tiers (common, rare,
  epic, legendary, mythic, earned), animated styles up to layered mythic ones with a
  colour-shifting spark; 4 earned only (rank Comet, 7-day streak, 5 clean levels, world 4).
  Shop (`SkinsScene`) with a live preview, buy / equip / try for one run.
- **Ranks** (`src/sim/meta.ts`, `RanksScene`): 12 ranks with code-drawn badges, a pure score,
  the ladder with breakdown, a records board (best per level with attempts and date, endless
  best with date, daily history), feats (20 achievements with gems); rank on the title,
  rank-up ceremony across the top of the cards (never blocks the retry).
- **Excitement**: flow meter (gems and perfect sections; 5 levels bring music layers 4-5, a
  brighter world, a longer, fatter trail; reset on death), PERFECT callouts, 25/50/75 %
  milestones, "so close" at ≥ 85 %, new-best fanfares sized by the improvement, daily streak
  reward ladder 5/6/7/8/10/12/20 then 12.
- **Save v3** with a v2 → v3 migration (levels, gems, skins, records kept; finish and gem stars
  derived; tested).

### Tuning numbers

- Tick 120 Hz. Spark radius 13 px (mini 7.5); drawn ~34 px. Lateral speed = scroll speed.
  Gates: fast ×1.38, slow ×0.72. Launch ramp 20 %→100 % over 800 px; opening chamber walls at
  the screen edges for 340 px.
- Level base speeds (px/s): 470, 485, 500, 510, 525, 540, 555, 570, 585, 600.
- Crux per level: needle at q = 0.08, 0.18, 0.28, 0.37, 0.46, 0.54, 0.60, 0.66, 0.72, 0.78
  (sets the margin) and a rhythm zigzag with legs 256 … 142 px (sets the window).
- Slalom: 3-5 blocks, spacing 500→340 px, gap 200→130 px. Non-crux slaloms/zigzags of levels
  7-10 are capped near q 0.5 (they were the human model's wall).

Solver table (margin = largest clearance a finishing plan keeps everywhere with every
press/release ≥ 100 ms; window = largest minimum press/release of any finishing plan):

| Level | Length | Margin | Window | Speed |
|---|---|---|---|---|
| 1 | 44.1 s | 47.85 px | 591.7 ms | 470 |
| 2 | 46.4 s | 43.55 px | 541.7 ms | 485 |
| 3 | 46.3 s | 39.84 px | 491.7 ms | 500 |
| 4 | 48.8 s | 36.13 px | 441.7 ms | 510 |
| 5 | 47.5 s | 32.81 px | 400.0 ms | 525 |
| 6 | 49.9 s | 29.10 px | 358.3 ms | 540 |
| 7 | 46.7 s | 25.98 px | 325.0 ms | 555 |
| 8 | 46.2 s | 24.22 px | 300.0 ms | 570 |
| 9 | 46.4 s | 21.29 px | 283.3 ms | 585 |
| 10 | 43.3 s | 18.55 px | 258.3 ms | 600 |

Human-model table (200 seeded attempts per level, react 250 ms, noise ±40 ms):

| Level | Finished | Mean progress |
|---|---|---|
| 1 | 100.0 % | 100 % |
| 2 | 100.0 % | 100 % |
| 3 | 99.0 % | 100 % |
| 4 | 92.5 % | 98 % |
| 5 | 79.0 % | 93 % |
| 6 | 62.5 % | 92 % |
| 7 | 33.5 % | 77 % |
| 8 | 29.0 % | 82 % |
| 9 | 26.5 % | 74 % |
| 10 | 10.0 % | 63 % |

Both solver columns strictly decrease (tested); the human table is tested for ≥ 50 % at level 1,
≥ 30 % at level 2, no rise > 3 points, no drop > 30 points, level 10 in (0, 15 %]. The model is a
practised player: it knows the line from the first attempt, so a first-timer will do worse than
level 1's 100 % for the first few tries. Endless: 70 seeds × 14 segments at creeping, minimum and
maximum speed and 8 deep runs, solved with 1 px to spare and replayed (tested).

Worlds 2-4 (`tests/unit/world*.test.ts`, same model, 200 attempts, seed 1000+id). Margin and
window shrink strictly inside each world; each world opens easier than the boss before it but
harder than the previous world's first level, and each boss is harder than the last.

| Level | Len | Margin | Window | Speed | Human | | Level | Len | Margin | Window | Speed | Human |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 11 split | 35.5 s | 39.45 | 391.7 | 500 | 99.0 % | | 31 portal | 35.6 s | 30.27 | 333.3 | 530 | 75.5 % |
| 12 | 41.0 s | 36.52 | 375.0 | 510 | 93.5 % | | 32 | 37.1 s | 28.32 | 316.7 | 540 | 63.0 % |
| 13 laser | 38.1 s | 33.79 | 350.0 | 520 | 92.5 % | | 33 | 36.3 s | 25.98 | 300.0 | 550 | 46.5 % |
| 14 | 38.2 s | 31.45 | 333.3 | 530 | 76.0 % | | 34 mirror | 37.9 s | 24.22 | 283.3 | 560 | 36.5 % |
| 15 | 38.2 s | 29.30 | 316.7 | 540 | 64.0 % | | 35 | 37.3 s | 22.27 | 275.0 | 570 | 34.5 % |
| 16 spin | 35.4 s | 26.17 | 291.7 | 550 | 62.5 % | | 36 | 36.8 s | 20.12 | 258.3 | 580 | 20.0 % |
| 17 | 36.4 s | 23.83 | 275.0 | 560 | 35.5 % | | 37 | 35.6 s | 18.36 | 233.3 | 590 | 21.5 % |
| 18 | 36.2 s | 21.48 | 250.0 | 570 | 31.5 % | | 38 | 35.8 s | 16.41 | 216.7 | 600 | 9.5 % |
| 19 | 35.5 s | 18.95 | 233.3 | 580 | 20.0 % | | 39 | 36.6 s | 14.06 | 200.0 | 610 | 8.5 % |
| 20 boss | 42.4 s | 16.21 | 208.3 | 590 | 8.5 % | | 40 boss | 42.0 s | 12.70 | 183.3 | 620 | 2.0 % |
| 21 wind | 40.0 s | 34.57 | 358.3 | 515 | 94.5 % | | | | | | | |
| 22 | 38.0 s | 32.81 | 341.7 | 525 | 89.5 % | | | | | | | |
| 23 piston | 36.7 s | 30.47 | 325.0 | 535 | 84.5 % | | | | | | | |
| 24 | 38.2 s | 27.93 | 308.3 | 545 | 61.0 % | | | | | | | |
| 25 | 36.4 s | 25.00 | 291.7 | 555 | 53.0 % | | | | | | | |
| 26 dark | 36.2 s | 22.07 | 275.0 | 565 | 44.0 % | | | | | | | |
| 27 | 36.7 s | 20.51 | 250.0 | 575 | 35.0 % | | | | | | | |
| 28 | 35.8 s | 18.55 | 233.3 | 585 | 22.0 % | | | | | | | |
| 29 | 36.0 s | 16.41 | 216.7 | 595 | 15.5 % | | | | | | | |
| 30 boss | 38.3 s | 14.26 | 200.0 | 605 | 5.5 % | | | | | | | |

Every level of worlds 2-4 also has a finishing plan with margin above NEAR_PX (the "no near
miss" star is possible) and a finishing all-gems plan (tested).

Progress score (`meta.ts`, pure, tested): 10 per star + 15 per level finished + endless best/10
(cap 400) + 10 per best-streak day (cap 30) + 4 per daily day (cap 100) + 10 per trail and 5 per
shape owned beyond the free one + 15 per feat. Ranks at 0, 60, 150, 280, 450, 650, 900, 1200,
1550, 1950, 2400, 2900: Ember, Flicker, Spark, Glow, Flare, Blaze, Torch, Beacon, Comet, Nova,
Pulsar, Supernova.

Gem income against prices. One-time income: level gems 120, stars 240 (2 each), world clears
140, feats 425 = 925; repeating: daily streak 5-20 a day plus the day's gems, endless 1 per
250 m. Prices: trails 3, 6, 10 (common), 15, 20, 26, 32 (rare), 40, 48, 56, 64 (epic), 80, 95,
110, 125 (legendary), 160, 200 (mythic) = 1090, shapes 6-32 = 120; 4 trails are earned only.

| Stage (one ~15 min session) | Typical income | Next trail costs |
|---|---|---|
| First session, world 1 levels 1-5 | ~35 (3 gems + ~3 stars/level, First Light 5) | 3 / 6 / 10 / 15 |
| Finishing world 1 | ~60-80 (stars, world clear 20, Ignited 15, Starlit 15) | 20-32 |
| World 2 | ~40-60 + world clear 30, Prism Breaker 25 | 40-64 (epic) |
| World 3 | ~40-60 + daily 5-12 + clear 40 | 64-95 |
| World 4 / replaying for stars | ~40-60 + daily + endless + clear 50 | 110-200 |

### Measured

- Retry (smoke test, in the page from the death): tap accepted 262 ms after death, run restarted
  at 262 ms, sim advancing at 395 ms.
- Stepped-clock input tests: a 5 ms tap between frames → exactly one held tick (3 of 3); a press
  3 ms before the end of a 200 ms frame → every tick ending before it ran released, the first held
  tick is the first ending after it; at 30 fps with Phaser's 16.7 ms clamp emulated the run kept
  0.993 sim s per real s in the first second and 1.001 later.
- Own JavaScript per frame while playing (earlier measurement): avg 1.3 ms, p95 8 ms on this
  software-rendered machine.
- Animation round, level 10 autopilot, the old and new builds run back to back twice (load ~6):
  own update avg 1.65 / 1.64 ms before → 2.09 / 1.89 ms after (p95 7.5 / 7.3 → 8.4 / 8.1, max
  18.3 / 10.9 → 12.5 / 12.6); step+render avg 3.82 / 3.99 → 5.49 / 3.92 ms. About +0.3-0.45 ms.
- Presentation test (`tests/e2e/presentation.spec.ts`): levels 6 and 34 (mirror twin, portals,
  dark section) on autopilot under a stepped clock with `fx=1` and `fx=0` give the same sim
  hash, tick, position and gems.
- Retry latency on the game clock (stepped, so machine load cannot affect it): tap taken
  264 ms after death, run advancing at 297 ms (33 ms frames, fx on and off), 272 / 289 ms at
  17 ms frames; identical for the build before the animation round.
- Content round, own update per frame, autopilot, load ~4: level 10 avg 2.35 ms (max 14.3),
  level 40 avg 2.29 (max 13.1), level 30 avg 2.04 (max 9.6), level 20 avg 1.83 (max 8.0). New
  hazards are drawn with one Graphics per frame (no baking), so no mid-run hitch.
- Human model and seeds: the streams the table uses (seed 1000+id) start with finishes on
  levels 8-10 (L8 `FFF.......F.`, L9 `F......F.F..`, L10 `.F.F........`); over 200 attempts they
  give the table's 29.0 / 26.5 / 10.0 %, fresh seeds 32.0 / 22.5 / 13.5 %. Lucky starts, not a
  wrong table.

### Deviations from the concept, and why

- **No separate menu or result scene**; title and cards are overlays of the game scene.
- **The run starts on the first press** and starts slow (launch ramp), not at full speed.
- **Flip ends on its own gate** (`unflip`), not a second flip; speed gates end on "1× speed".
- **Hit-stop only on death**; gates get a zoom punch.
- **Gradient art is canvas-drawn** rather than core texture recipes.
- **Phaser touchcancel fix** (`src/input/touchCancelFix.ts`).
- **Frame cap differs under automation** (200 ms vs 100 ms for players), so game time follows the
  wall clock on this ~5 fps build machine; tests that need exact timing use Playwright's clock.
- **Real-touch test uses the Playwright clock and re-plans from the spark's real state** before
  each move (open-loop replay random-walked off the line). It proves press/release steering,
  >30 % of level 1 with real CDP touches (32.2 % last run), multi-touch and cancel safety, and
  tap-to-retry; not real-time latency.

### Candidates for core

- A music step sequencer driven by position on the music bus.
- Canvas (gradient) texture recipes.
- The Phaser touchcancel `cancelable` check.
- A hold input with timestamped edges and a per-tick edge queue (`HoldInput` + `EdgeQueue`).
- Real-time deltas for real players (Phaser's 16.7 ms clamp after load/refocus slows every
  fixed-tick game for its first ~2-4 s).
- A letterbox styling hook.
- A presentation toggle plus a running sim hash in the test hook, to prove visuals never touch
  the sim.
- Pooled, typed-array "world" sprite layers (motif + motion spec) for animated backgrounds.

### Unfinished / not verified

- Keys/shortcuts were not built: climb speed is input-independent, so a "shortcut" cannot save
  time, and a key would make hazards depend on run history (solver state ×2). Speed ramps are
  covered by the existing speed gates.
- Not heard: the audio mix was never listened to. Not run on a phone (frame time, haptics,
  audio latency). Levels are tuned against a model, not people.

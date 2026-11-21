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

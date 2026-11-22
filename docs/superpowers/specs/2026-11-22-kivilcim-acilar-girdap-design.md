# Sparkrise: view twists, a fifth world, a Dive mode

Owner's request (2026-11-22): "add new gameplay variations, new maps and view angles to the games,
and polish". The owner left every decision to us. These are our calls, not theirs.

## Why
Forty levels and eight mechanics all share one view: the shaft climbs straight up the screen. A
new way of *seeing* the same flight is the cheapest real variety this game can get, and it does
not touch the deterministic sim the solver and the human model prove.

## Goals
1. **View twists**: the camera presents the same sim differently for a stretch of a level.
2. **World 5, "Vortex" (TR: Girdap)**: ten new levels (41 to 50) built around the twists, boss at 50.
3. **Dive mode**: an endless run flown downward, open as soon as Endless is (after level 3), so
   the new look is reachable in the first session.
4. Polished to the level of the 2026-11-22 polish round.

## Non-goals
- Worlds 1 to 4: geometry, timing, stars and the frozen world-1 replay test stay bit for bit.
- No new control scheme: hold = one diagonal, release = the other, always.
- No real-money purchases, no new ad placements.

## Anti-goals
- A twist that changes which input is correct without telling the player first. A twist never
  changes the sim; on screen the spark's "hold" side may move, so every twist starts with a calm
  stretch, a named gate/banner in the HUD band and an arrow that shows which way "hold" now goes.
- Lookahead shorter than the player needs: under every twist the player must see at least as far
  ahead (in sim px along the flight) as the tightest existing view gives at that speed, or the
  twist is dropped. Hazards must be drawn where they are lethal, as today.
- Motion sickness: no fast spins, no continuous roll faster than about 12 degrees a second, no
  twist on top of a crux section. Reduced motion (`isCalm`): twists that move continuously become
  fixed poses.
- More flashes or shake (owner complaint): the polish round's levels stay.

## The twists (presentation transforms of the world layer; the HUD stays upright)
- **Dive**: the view is flipped top to bottom: the spark flies down the screen. Hold still goes
  to the same screen side as before (mirror so that it does).
- **Sideways**: the shaft runs across the screen and the spark flies to the right; the corridor is
  scaled to fit the portrait width with the lookahead rule above. If it cannot be made readable on
  a 390x844 phone, drop it and say so in the report.
- **Tilt / slow roll**: the world leans up to 12 degrees either way and may rock slowly.
- **Zoom**: far (more lookahead, smaller spark) and near (tense, only on easy stretches).

A twist is level data (a range of the level + kind + strength), presentation only: the sim hash
with twists on and off must be identical (extend the existing fx on/off test). The solver and the
human model do not know about twists.

## World 5: Vortex
- Levels 41 to 50, each introducing or combining twists with the existing eight mechanics; each
  twist is introduced alone, on an easy level, with a one-time cue. Level 50 is a boss finale in
  the style of 20/30/40.
- Built with the existing builder/patterns/solver pipeline. Every level must pass the same proofs
  the first forty do (completable, all three gems reachable on a finishing run, launch safety).
  Difficulty: world 5 starts a little easier than level 40 and ends as the hardest level.
- Its own colour schemes and backdrop motif(s). Opens after level 40 with a star requirement that
  continues the existing ladder (builder picks; a player with two stars per level must be able to
  open it). World clear gems and one new earned trail continue the existing tables.
- Save: arrays that are sized by level or world count grow; add a migration or an additive repair
  with a test using a literal save from before this change. Nothing a player has is lost.
- Level select shows five worlds (tabs must still fit); ranks/feats tables get world 5 entries
  where a table is per world. Existing rank thresholds do not move.

## Dive mode
- A fourth mode beside Level / Endless / Daily: Endless rules and generator, drawn with the Dive
  twist all the way, from its own seed stream, with its own best height, its own title-screen
  entry and ready plate. Unlocks with Endless. Milestone gems as in Endless, same cap rules.
- After 300 m, Endless and Daily may also get short twist stretches (tilt, zoom) between segments.
  Daily stays identical for everyone on a date.

## Polish and UI
- Each twist has a gate look and a HUD-band banner; entering and leaving a twist eases over a calm
  stretch (never a snap, except under reduced motion).
- Dive mode card and best on the title; world 5 tab, cards and boss intro; all with `menuFx.ts`.
- All new text in `en` and `tr`.

## Left to the builder
Exact twist strengths and easing, which levels get which twist, pattern choices, speeds, star
requirement, colours, the new trail, test seeds. Anything not listed in Non-goals/Anti-goals.

## Done
Typecheck and lint clean; full unit suite passing with new tests (twists do not change the sim
hash; levels 41 to 50 pass the level proofs; save growth; Dive mode records); the e2e suite
passing; screenshots of each twist in play, the world 5 tab, level 50's boss, Dive mode, the
title; a factual report of what is unverified, including the human-model finish rates for 41 to 50.

# Fossil Odds: a depth map, weak spots, Dig Rush

Owner's request (2026-11-22): "add new gameplay variations, new maps and view angles to the games,
and polish". The owner left every decision to us. These are our calls, not theirs.

## Why
The first four layers (where every new player is) are plain tapping: the twists start at layer 5,
tens of minutes in. And the world is only ever seen one block at a time: there is no picture of
where you are in the ground. Variety has to show up in the first minutes, and the game needs one
new way to look at itself.

## Goals
1. **Depth map**: a new screen, a cross-section of the whole dig from the surface down, used to
   see progress and to travel.
2. **Weak spots**: an aiming element in the tap loop from the very first block.
3. **Dig Rush**: a 45-second timed event, a different rhythm from the idle loop.
4. Polished to the level of the 2026-11-22 polish round.

## Non-goals
- No new layer, fossil, tier, upgrade or currency. Loot tables, printed odds, luck rules and the
  honesty tests do not change. No real-money purchases, no new ad placements.
- The measured pacing tables (`tests/unit/pacing.test.ts`) keep passing with their policies
  unchanged: the scripted players do not use the new features, so the new features may only ever
  add progress, never be needed for it.

## Anti-goals
- Any randomness that is not printed, or a printed odd that stops being true (honesty rule).
- Anything thinking-heavy or slow: the owner called the slow, thinking games "very bad". Every
  new interaction resolves in a tap or a few seconds.
- More flashes or shake (owner complaint): the `fx/Motion.ts` caps stay.
- A feature that floods dust so the upgrade curve or the expedition timing collapses.

## Depth map (new scene)
- Opened from the dig screen (joining the layer arrows, which stay as a shortcut) and from the
  menu. A tall, scrollable cross-section: sky and surface at the top, each layer a band in its
  own material and colours with its ambient life in miniature, down to the deepest. The current
  layer is lit and the helper stands in it.
- Each band shows: name, set progress (n/12, a tick when complete), its twist's icon, the rarest
  fossil found there, and a lock with the dig power needed when not yet open. Tapping an open band
  travels there (the existing descent/ascent plays). The next locked band shows progress toward
  its unlock.
- Expedition strata (after an expedition) show as a depth marker; nothing about the rules changes.
- Reads the sim through the existing read-only view; adds no rule.

## Weak spots (sim: `src/sim/dig.ts`, tested)
- While a block stands, a weak spot appears on it now and then (about every 6 to 9 s, visible
  about 2.2 s; never while a glint is up, never in the same place twice in a row). A tap **on** it
  is a **precise hit**: x4 damage for that tap, a distinct look and sound. A tap elsewhere is a
  normal tap. Missing it costs nothing.
- Consecutive precise hits (no weak spot left to expire between them) build a small "sharp eye"
  count, shown on screen; it has no effect on luck or odds, only on the precise-hit damage (up to
  x6 at 5 in a row). Luck is untouched, so every honesty table stays as it is.
- It is a damage bonus only, deterministic, drawn from its own rng stream so that no existing
  stream shifts (existing seeded tests must not change results).
- The assistant never uses weak spots. Offline hauls ignore them.
- Taught by a one-time tip on the first weak spot.

## Dig Rush (sim + scene)
- An event on the dig screen: a button with a cooldown (builder's call, about every 3 hours of
  wall-clock time; the first one is offered once the Topsoil set has 4 species, so new players
  meet it early). No ad needed to start it.
- 45 seconds on the current layer: blocks have a fixed share of the layer's normal health so a
  fast tapper breaks one every second or so; every break rolls the layer's normal table at the
  luck shown on screen (the same tap luck rules; no hidden bonus). Fever, chains and weak spots
  work. Special blocks (vein, unstable, twin, boss, cave-in) do not appear during a rush; golden
  ones may.
- The clock, blocks broken and finds are shown; the last 10 s pulse (no shake). The result card
  lists blocks, finds (rarest first), dust earned and the personal best (blocks in one rush, kept
  per save). Finds are real finds: they go to the museum and can fuse.
- Balance guard (tested): one rush is worth at most about 4 minutes of the same player's normal
  active play on that layer in blocks broken, and the cooldown keeps it from being the main
  source of progress. The pacing tests stay green with unchanged policies.
- Save: additive fields (cooldown time using the monotonic clock rules in `src/sim/clock.ts`,
  best) with a default and a test; winding the device clock back and forth earns no extra rush.

## Polish and UI
- Map: bands slide in with a parallax scroll, the lit band breathes, travel plays from the map.
- Weak spot: a clear target ring that closes in; precise hit = a crisp star and chips, a rising
  tick per sharp-eye step. Nothing covers the block's HP bar or the status line.
- Rush: a start banner, a different sky/lighting on the site for its 45 s, a count-up result.
- All new text in `en` and `tr`; reduced motion and `?fx=0` respected.

## Left to the builder
Numbers above marked "about", layouts, art, sounds from the existing set, test seeds. Anything
not listed in Non-goals/Anti-goals.

## Done
Typecheck and lint clean; full unit suite passing with new tests (weak spot damage and streams,
honesty tables unchanged, rush rules, rush balance guard, cooldown and clock, save default); the
e2e specs passing; screenshots of the map (top, middle, locked band), a weak spot and a precise
hit, a rush in play and its result card; a factual report of what is unverified.

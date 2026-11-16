# Lantern Shift (TR: Fener Nöbeti) — concept

Slug `fener` · portrait 720×1280 · score 80/100 · mechanic: anomaly spotting on fixed camera views

## Pitch

You are the night keeper of a remote lighthouse station. Four cameras, one screen.
Things change when you are not looking. Notice what changed, report it, and keep
the station from slipping away before dawn.

Tone: cozy-eerie, never gory. A calm job that slowly gets under your skin.

## Why this game

Browser demand: two anomaly games rated 9.3. Mobile competition is weak and badly
rated (largest Play rival: 500K installs at 2.5 stars). Anomalies are parameter
changes on objects, which suits code-drawn art perfectly. Differentiator versus
"find the hidden guy" games: this is about memory and change, not searching.

## Core loop (one shift ≈ 3.5 minutes)

1. A shift runs from 00:00 to 06:00 in-game; one in-game hour ≈ 35 real seconds.
2. The first 15 seconds are a grace period: flip through the cameras and memorize.
3. Anomalies then spawn at seeded random intervals, only on cameras that are NOT
   currently on screen.
4. To report: tap the object (or the empty spot where an object used to be), then
   pick the anomaly type from chips. Right object = anomaly cleared with a burst of
   static and points. Right type too = bonus points. Wrong object = false report:
   8 seconds of camera static (you are blind while anomalies pile up).
5. Lose when 4 anomalies are active at the same time. Win by reaching 06:00.

## Anomaly types

Moved · Recoloured · Missing · Extra (duplicate) · Resized · State change (light
off, door open, window shut) · Intruder (a shape that does not belong).
Every scene object declares which types it supports and its parameter ranges, so
anomalies are generated, not hand-authored. Subtlety (how far it moves, how close
the new colour is) scales with the night number.

## Content for the vertical slice

- One station with 4 cameras: Lamp Room, Stairwell, Dock, Kitchen. 10–14 objects
  per camera, each camera with a distinct silhouette so the player knows where they are.
- Campaign: nights 1–7. Spawn rate and subtlety rise; night 1 gives a faint audio
  cue on spawn, later nights do not; "Intruder" first appears on night 3.
- Daily shift: seeded by the calendar date, same for everyone, best score of the day
  and a day-streak counter.
- Logbook: every (object, anomaly type) pair you have correctly reported is recorded;
  show completion percentage. This is the long-term collection goal.

## Feel

- Palette: deep navy night, warm lamp yellow, sea teal, static white. One accent red
  used only for danger (active-anomaly counter at 3).
- Camera look: scanlines, slight vignette, camera name and running timestamp.
  Switching cameras gives a short static flicker and a click.
- Audio (synthesized): low drone, filtered-noise sea wash, relay clicks, a soft
  confirming tone on a correct report, harsh static on a false one.
- The active-anomaly counter is always visible; at 3 the screen edge pulses.

## Sim (pure, in `src/sim/`)

`ShiftSim(seed, night)` owns: scene definitions (data), object states, spawn
schedule, `tick(dt)`, `switchCamera(i)`, `report(cameraIndex, objectId, type)`,
score, active anomaly list, win/lose state. Deterministic for a given seed.

Unit tests must cover: no spawn on the visible camera; no spawn during grace;
spawned anomaly really differs from baseline by at least the night's minimum
subtlety; report outcomes; lose at 4 active; win at 06:00; same seed → same shift.

## Test hook

`state()` returns night, clock, current camera, active anomalies (with ids), score,
phase. `act('switch', i)`, `act('report', {camera, objectId, type})`,
`act('fast-forward', seconds)`. The smoke test wins a night by reporting every
anomaly as it appears, and separately loses a night by doing nothing.

## Monetisation hooks (interface only, no provider)

Rewarded: "second wind" once per shift when you would lose — clears two anomalies.
Interstitial: between nights, never during a shift.

## Out of scope for the slice

More stations, story text, cosmetics, leaderboards.

## Built (vertical slice)

**Screens.** Menu (title, streak or tagline, Start shift → night select, Daily shift, Logbook
with %), night select (nights 1–7, locked until the previous night is survived, best score per
night), the shift (HUD clock / night / score / four anomaly pips, 640×640 CCTV monitor, four
camera tabs, type chips after tapping something, brink modal), result (count-up, best, outcome
line, report stats, unlock / new-logbook / streak line; "Next night" after a won campaign night),
logbook (159 entries: per camera, each object's supported types lit when reported with the right
type, intruder spots as one row; completion % and bar), core pause menu.

**Sim** (`src/sim/`, pure): `station.ts` (4 cameras, 12–13 objects each, 3 intruder spots each,
all data), `night.ts` (constants + per-night params), `shift.ts` (`ShiftSim`: tick, switchCamera,
report, hitTest, useSecondWind/declineSecondWind, events), `progress.ts` (campaign unlocks,
logbook, daily seed/best/streak). 47 unit tests incl. every test GAME.md asks for, a hit-test
suite, data validity and a balance suite (simulated watcher).

**Rendering.** The monitor is a second Phaser camera whose viewport is the screen rectangle and
which looks at rooms drawn off-screen (x = 4000), so moved/resized objects are clipped by the
monitor edge. Every object is a `Graphics` drawn by kind (41 kinds) with its colour and on/off
state; redrawn only when the sim's `version` changes. Overlay: scanlines, vignette, camera tag,
running timestamp, blinking REC dot, static (tile sprite).

### Tuning (chosen)

| | night 1 | night 7 | notes |
|---|---|---|---|
| spawn gap (s) | 14–22 | 6.5–11 | linear between; first spawn 1–4 s after grace |
| min move / duplicate offset (px of 640) | 90 | 38 | max move = 1.6 × min; duplicates ≥ 1.05 × object size |
| min recolour (RGB distance 0–441) | 170 | 80 | at most min + 130 |
| min resize (max(s,1/s) − 1) | 0.45 | 0.22 | up to 1.5 × min, grow or shrink |
| audio cue on spawn | yes | no | |
| intruders | from night 3 | | one intruder per camera at a time |

Shift: 35 s per in-game hour, 6 hours (210 s), 15 s grace, lose at 4 active, 8 s static after a
false report, 8 s brink countdown. Points: right object 100, right type +50, speed bonus up to
+50 falling to 0 at 20 s, dawn +300. Daily shift uses night-4 difficulty, seed
`hash("fener-daily-YYYY-MM-DD")`.
Measured (balance test, 60 seeds): a watcher spending 10 s per camera and 5 s to notice wins
night 1 100 % and night 7 ~5 %; 4 s / 2 s wins night 7 100 %; doing nothing always loses.

### Decisions where the concept was open, and deviations

- **Report must be on the camera on screen.** `report()` for another camera is ignored (you can
  only point at what you see). Tapping empty space does nothing (no false report); a false report
  needs an object or intruder.
- **Tapping where a missing or moved object used to be selects it** (baseline boxes always hit),
  so this leaks nothing and lets you report "missing". Hit boxes are at least 88 px; when boxes
  overlap, the one whose centre is relatively closest wins. Moved objects and duplicates prefer
  spots that do not overlap other objects.
- **Wrong type still clears** the anomaly (right object = cleared, as the concept says) but only
  the right type earns +50 and a logbook entry.
- **Blind (static) does not stop the clock or spawns**, and switching cameras still works.
- **Brink / second wind:** at 4 active the clock freezes and a modal offers "Second wind"
  (rewarded ad, once per shift, clears the two oldest). It auto-declines after 8 s, so doing
  nothing loses. After second wind is used, the next 4th anomaly loses at once.
- **Spawn picks a random non-visible camera, then a random (object, type) pair** from objects
  without an active anomaly; "state" only on objects that declare an initial state.
- **Concept said 10–14 objects per camera**: built 13 / 12 / 12 / 12.
- **Interstitial** only on "Next night" from the result screen; never on Replay or in a shift.
- **Test hook** also exposes `select {x,y}`, `chip type`, `pause`, `secondWind`, `letGo`, and tap
  positions (`active[].at`, `ui.tabs`, `ui.chips`) so the smoke test can drive a whole night with
  real pointer taps.
- **Not built:** hint/tutorial beyond the grace hint line; per-anomaly visual "aging".

### Local workarounds that are candidates for core

- `GameScene.openPauseMenu()` brings the pause scene to the top: core registers `PauseScene`
  before the game's scenes, so in any scene with an opaque background the pause menu renders
  underneath it (invisible but still taking input).
- `scenes/widgets.ts` `Chip`: a toggleable button with a code-drawn glyph (row or column
  layout); core's `button` only takes text.
- `fillPoints` typing wants `Vector2[]`; a cast helper `pts()` is used in `art.ts`/`Background.ts`.
- Ambient bed (`audio.ts` `Ambience`): drone + filtered-noise sea wash on `audio.musicOutput`.

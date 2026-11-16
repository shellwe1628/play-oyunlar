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
with %, How to play), briefing (three rules, shown once before the first shift and from How to
play; one tap dismisses), night select (nights 1–7, locked until the previous night is survived,
best score per night), the shift (HUD clock / night / score / four anomaly pips labelled
"4 = station lost", 640×640 CCTV monitor, four camera tabs, a hint row under the tabs, type chips
after tapping something, brink modal), result (count-up, best, outcome line, report stats,
unlock / new-logbook / streak line; "Next night" after a won campaign night), logbook (159
entries: per camera, each object's supported types lit when reported with the right type,
intruder spots as one row; completion % and bar), core pause menu.

**Sim** (`src/sim/`, pure): `station.ts` (4 cameras, 12–13 objects each, 3 intruder spots each,
all data), `night.ts` (constants + per-night params), `shift.ts` (`ShiftSim`: tick, switchCamera,
report, hitTest, useSecondWind/declineSecondWind, events, `evidencePoint`; daily mode with a
pre-rolled schedule), `progress.ts` (campaign unlocks, logbook, daily seed/best/streak,
briefing flag). Unit tests: every test GAME.md asks for, hit-testing (every intruder spot at its
centre; an all-anomalies reportability sweep over nights 1–7 × 80 seeds, re-checked at every
spawn), scoring details, spawn-gap distribution, daily determinism across play styles, data
validity and a balance suite (simulated watcher). Each of the eight mutations from the review
(no dawn bonus, no speed bonus, wrong type logged, several intruders per camera, spawnMax
ignored, flipped tie-break, no touch minimum, resize never shrinks) fails the suite.

**How an anomaly is made.** A spawn picks a non-visible camera and an (object, type) pair and
builds a *plan*: the exact resulting state (new position, colour, scale, on/off, duplicate spot,
or a visible intruder) from static data and the rng. Moved objects and duplicates prefer spots
off every other object's home box and the intruder spots. The plan is applied and kept only if
every anomaly on screen is still reportable at its visible centre (`evidencePoint`); otherwise it
is reverted and another pair is tried.

**Hit test.** A visible intruder is drawn on top and wins inside its box. Otherwise every
object's home box, current box and duplicate box count; boxes are at least 88 px (touch); among
real boxes under the finger the one whose centre is relatively closest wins, an exact tie goes
to the object drawn on top (declared later); a point only inside an enlarged touch box goes to
the nearest centre.

**Daily shift.** The whole schedule (time, camera, object, type and the exact change) is rolled
from the date seed up front with every entry applied at once, so it is reportable even if a
player clears nothing; each object and each camera's intruder is used at most once per day. A
scheduled change on the camera on screen waits until the player looks away. Two different play
styles on the same date get the same anomalies (unit-tested).

**Rendering.** The monitor is a second Phaser camera whose viewport is the screen rectangle and
which looks at rooms drawn off-screen (x = 4000), so moved/resized objects are clipped by the
monitor edge. Every object is a `Graphics` drawn by kind (41 kinds) with its colour and on/off
state; redrawn only when the sim's `version` changes. Overlay: scanlines, vignette, camera tag,
in-game HH:MM with a colon blinking once per second, blinking REC dot, static (tile sprite).
Intruders fade with the night (opacity 0.95 on night 1 → 0.6 on night 7).

**Shift clock.** The sim is stepped with Phaser's unsmoothed wall-clock frame delta
(`game.loop.rawDelta`) through core's `realTimeDelta()` (at most `MAX_FRAME_MS` = 200 ms per
frame), frozen by hit-stop and while the second-wind ad is showing. Why not core's pattern (the
`delta` Phaser passes to `update`): core makes that follow the wall clock only under automation
and `?test=1`; for real players it keeps Phaser's smoothing, which clamps every frame to 16.7 ms
while the window is unfocused and for 120 frames after start/focus/tab-visible. The shift is a
wall-clock contract (35 real seconds per in-game hour; the night is 3.5 min), so the game keeps
its own raw-delta stepping for everyone and only borrows core's cap. The tab-hidden case is
still covered: the shift scene auto-pauses. The sim needs no `splitStep` slicing: `tick(dt)`
handles any dt (hour events, spawns in a loop). (Before the fix a 100 ms per-frame clamp made the clock run slow on
any device under 10 fps: 0.435× wall time measured in this container, i.e. a ~8 min night.)
Measured after the fix, no fast-forward, in this container under load average 10–19 on 4
cores at 5–8 fps: a full night (00:00 → 06:00, 210 s of shift) took 229 s of wall time; a 20 s
sample ran at 0.97× wall time. On a device rendering at 4 fps or more a night is 210 s ≈ 3.5 min.

**Tests:** 59 unit tests in 7 files; 4 Playwright smoke tests (win night 1 via the test hook with
pause / tab-hide; lose by doing nothing + daily start; a full night 1 with real touch taps incl.
briefing dismiss and the grace-tap rule; a full night 5 with real touch taps that taps an
intruder). Under heavy machine load the real-tap tests poll for each state change (20 s) instead
of fixed sleeps.

### Tuning (chosen)

| | night 1 | night 7 | notes |
|---|---|---|---|
| spawn gap (s) | 14–22 | 6.5–11 | linear between; first spawn 1–4 s after grace |
| min move / duplicate offset (px of 640) | 90 | 38 | max move = 1.6 × min; duplicates ≥ 1.05 × object size |
| min recolour (RGB distance 0–441) | 170 | 80 | at most min + 130 |
| min resize (max(s,1/s) − 1) | 0.45 | 0.22 | up to 1.5 × min, grow or shrink |
| audio cue on spawn | yes | no | |
| intruders | from night 3 | | one intruder per camera at a time; opacity 0.95 → 0.6 |

Shift: 35 s per in-game hour, 6 hours (210 s), 15 s grace, lose at 4 active, 8 s static after a
false report, 8 s brink countdown. Points: right object 100, right type +50, speed bonus up to
+50 falling to 0 at 20 s, dawn +300. Daily shift uses night-4 difficulty, seed
`hash("fener-daily-YYYY-MM-DD")`.
Measured (balance test, 60 seeds): a watcher spending 10 s per camera and 5 s to notice wins
night 1 100 % and night 7 ~5 %; 4 s / 2 s wins night 7 100 %; doing nothing always loses.

### Decisions where the concept was open, and deviations

- **Report must be on the camera on screen.** `report()` for another camera is ignored (you can
  only point at what you see). Tapping empty space shows a small neutral ripple (no penalty); a
  false report needs an object or intruder.
- **Grace period:** tapping during the first 15 s opens no chooser; the hint row says nothing has
  changed yet.
- **Tapping where a missing or moved object used to be selects it** (home boxes always hit), so
  this leaks nothing and lets you report "missing".
- **Wrong type still clears** the anomaly (right object = cleared, as the concept says) but only
  the right type earns +50 and a logbook entry; the screen says "right spot, wrong kind: no
  bonus".
- **Messages** (new logbook entry, wrong kind, too early) appear in the hint row under the camera
  tabs, never over the clock or pips. The game calls no core `toast` itself; the only core toast
  left is the result shell's "New best!", which now sits mid-screen on the result card (no
  monitor there; checked in the result screenshot).
- **Blind (static) does not stop the clock or spawns**, and switching cameras still works.
- **Brink / second wind:** at 4 active the clock freezes and a modal offers "Second wind"
  (rewarded ad, once per shift, clears the two oldest). It auto-declines after 8 s, so doing
  nothing loses; the countdown is held from the tap until the ad resolves. After second wind is
  used, the next 4th anomaly loses at once.
- **Pause** is ignored once the shift has ended (during the hand-off to the result screen). The
  smoke test checks that the pause menu is really drawn over the game (rendered pixel inside the
  pause card is the theme surface colour) and that the shift clock runs at 0.85–1.15× wall time
  (core `clockRate`).
- **Daily shift, deliberate consequences of the pre-rolled schedule:** (1) a scheduled change on
  the camera on screen waits until the player looks away, so a player who never leaves one camera
  never gets that camera's changes that day (they still get every other camera's); (2) the
  generator never pairs an intruder with a change to an object the intruder would stand in front
  of (8 such intruder/object pairs across the station), because the object's change would be
  hidden behind the intruder and unreportable; the generator skips such combinations in both
  campaign and daily shifts.
- **Chooser layout** is anchored to the safe bottom edge with a 32 px margin (checked at
  360×640, 390×844, 430×932).
- **Concept said 10–14 objects per camera**: built 13 / 12 / 12 / 12.
- **Interstitial** only on "Next night" from the result screen; never on Replay or in a shift.
- **Test hook** also exposes `select {x,y}`, `chip type`, `pause`, `secondWind`, `letGo`, briefing
  `ok`, menu `howto`, and tap positions (`active[].at`, `ui.tabs`, `ui.chips`) so the smoke tests
  can drive whole nights with real pointer taps (night 1, and night 5 with an intruder tapped).
- **Not built:** per-anomaly visual "aging".

### Local workarounds that are candidates for core

- `scenes/widgets.ts` `Chip`: a toggleable button with a code-drawn glyph (row or column
  layout); core's `button` only takes text.
- `fillPoints` typing wants `Vector2[]`; a cast helper `pts()` is used in `art.ts`/`Background.ts`.
- Ambient bed (`audio.ts` `Ambience`): drone + filtered-noise sea wash on `audio.musicOutput`.
- A scene-level `pointerup` listener did not fire for Playwright touch taps (`pointerdown` did);
  the briefing dismisses on `pointerdown`.

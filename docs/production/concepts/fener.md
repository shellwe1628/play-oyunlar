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

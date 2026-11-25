# Noodle Archers 3D: camera angles, two new modes, a new arena

Owner's request (2026-11-22): "add new gameplay variations, new maps and view angles to the games,
and polish". The owner left every decision to us. These are our calls, not theirs.

## Why
The game is one fixed side view and one kind of run (chapters, endless, daily). After the weapons
round the owner still wants it to feel less samey. Variety must be reachable in the first session:
content that only opens after hours of play does not answer the request.

## Goals
1. **Camera angles** the player can switch in play, plus short cinematic angles at big moments.
2. **Two new modes**, both open early, both on a **new arena** (a place that is in no chapter).
3. Polished to the level of the 2026-11-22 polish round.

## Non-goals
- No new chapter, weapon, card, enemy type or boss kind. No change to chapter balance, weapon
  numbers, chests, shop, the economy tests' meaning, or the save version (additive fields only,
  ruling D: fresh + repair + test in the same change).
- No real-money purchases. No new ad placements.

## Anti-goals (these make it a failure even if it works)
- More screen shake or flashes (owner complaint). No new shake sources; `stage.shake` rules stay.
- An angle that makes aiming less accurate, hides archers, or moves the DOM overlay off its targets.
- A mode that farms coins, chests, shards, boss first-kill rewards or weapon unlocks.

## Part A: camera angles (view only: `apps/okcu-3d/src/view/stage.ts`, HUD)
- The stage camera is an off-axis lens-shift camera: the gameplay plane z = 0 always fills the
  frame exactly, whatever the eye position. Angles are therefore **eye positions**: the plane's
  mapping, `toScreen` / `toLogical`, pointer input and the DOM overlay stay exact. Keep it that way.
- Three selectable angles: **Side** (today's), **Angled** (eye well to the player's side and a
  little higher: ledges and archers show their depth, a three-quarter look), **Low** (eye below the
  frame centre: archers loom, ledge undersides show). Exact offsets are the builder's call: pick
  them by looking at screenshots on every chapter theme and the new arena; nothing may clip, the
  backdrop may never show an edge, and archers on the far islands must stay fully readable.
- A camera button in the play HUD (near pause) cycles the angle with a ~0.4 s glide; the choice is
  remembered (a presentation setting outside the game save is fine). Reduced motion: a cut.
- Cinematic angles, automatic, short, never during aiming: a boss's entrance and a boss knockout
  may swing the eye (Low to Side) while the existing zoom plays. They end on the player's chosen
  angle. Reduced motion: none.
- The menu's Home framing keeps working on every angle (it frames the player's archer).

## Part B: modes (sim: `games/okcu/src/sim/**`, tests in `games/okcu/tests/unit/**`)
Both are started from the Events tab (`apps/okcu-3d/src/ui/events.ts`), each with a card: name,
one-line rule, personal best, Play. Both use the 3D build's 'hard' rules, the selected weapon and
its level, and the player's permanent upgrades.

**Blitz** (open after the first finished run): 60 seconds on the new arena. Plain archers drop in
continuously (two to four on the field; a new one drops as one falls), no cards between waves, no
bosses. Enemy health and aim follow the player's weapon power so it is brisk at any level (builder
tunes; target: a careful level-1 player gets 8 to 14 knockouts, a careful level-10 player clearly
more). Score = knockouts, headshots count double. The player cannot be knocked out; a hit costs
3 seconds off the clock. Ends at 0:00 with a result card: score, best, "new best" celebration.

**Boss Rush** (open after the chapter-1 boss is beaten): the six chapter bosses one after another
on the new arena, each with its own arena props only if the boss needs them. Full health between
bosses, one card pick after each boss. The power rule (`underPower`, `bossHurtMul`, rage) applies
with each boss's own chapter recommendation, so the rush shows how far the weapon carries. Score =
bosses beaten, ties broken by total time. Ends on knockout or after the sixth boss.

Rewards and guards (tested):
- Coins: knockouts pay by the normal run rules. A run chest by the normal rule (ruling T: none on
  quit, none with no shots). Nothing else: no boss first-kill reward, no weapon unlock, no reveal,
  no chapter progress, no `bosses` record, no rank score from these modes, no daily-streak credit.
- Bests are stored per mode (additive save fields with fresh/repair/tests).
- `createWorld` takes the mode in its options; a mode world never reports chapter progress.
- Economy tests keep passing unchanged. Add tests: Blitz ends at 60 s of sim time and the player
  cannot die; Blitz knockout bands at level 1 and level 10; Boss Rush order, the power rule per
  boss, no first-kill rewards, and a careful player at each boss's recommended level beats that boss.

## Part C: the new arena (view: `apps/okcu-3d/src/view/arena/**`, theme tables)
A seventh theme used only by the modes: **Sunset Canyon** (TR: Gün Batımı Kanyonu): warm
sandstone mesas, long shadows, drifting dust, a low sun. Code-drawn like the six themes, same
budget (no new lights, shadow casters or passes). Its own ledge material and props. It must read
clearly on all three camera angles.

## Polish and UI
- Events tab cards with the polish round's motion helpers (`ui/juice.ts`). Mode intro banner,
  Blitz clock in the HUD (pulses in the last 10 s, no shake), result cards with count-ups.
- All new text in `en` and `tr`.

## Left to the builder
Angle offsets, glide curves, Blitz spawn cadence and scaling numbers, the arena's layout and
look, where the camera button sits, test seeds. Anything not listed in Non-goals/Anti-goals.

## Done
Typecheck and lint clean; the full `games/okcu` unit suite passes with the new tests; screenshots
of each angle on two themes and the new arena, both modes in play, both result cards, the Events
tab; a factual report of what is unverified.

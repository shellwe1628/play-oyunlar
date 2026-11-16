# Ink Tide (TR: Mürekkep Seli) — concept

Slug `murekkep` · portrait 720×1280 · score 80/100 · mechanic: real-time border-push territory war against bots

## Pitch

Rival ink colonies bleed across a sheet of paper. Choose how much of your ink to
commit, tap a neighbour, and watch your border creep forward cell by cell. Soak the
page before the others do.

## Why this game

Browser demand is large (one 2025 title at 9.7 with 342k votes; the genre's
single-player form has only one small representative). On mobile the direct
equivalents are small or rated ≤ 3.9. The neighbouring "send troops between nodes"
genre IS saturated, so this game must not look or feel like nodes and arrows: there
are no nodes, only continuous borders that flow.

## Core loop (one match ≈ 2–4 minutes)

1. The map is a grid of cells (about 48×72) forming a paper landmass with gaps.
   Each colony starts as a small blot.
2. Every colony has an ink reserve. It grows each tick; growth depends on territory
   size and is fastest when the reserve is around half of its territory-based cap.
   Sitting at the cap wastes growth; spending everything leaves you defenceless.
3. Attack: set the commit slider (10–100 %, default 30 %), then tap any land that
   touches your border — blank paper or an enemy colony. That share of your reserve
   becomes a wave that advances along the shared border, cell by cell.
4. Each captured cell costs ink: blank paper is cheap, enemy cells cost according to
   the defender's ink density (reserve ÷ area), and the defender loses ink too.
   A wave stops when its ink runs out.
5. Win by holding 70 % of the land or being the last colony. Lose when you have no
   cells. A 2× speed toggle is available.

## Bots

Three personalities, combined with a difficulty level that changes reaction interval
and commit ratio:
- **Turtle** — takes blank paper only, keeps a high reserve, hits back hard when attacked.
- **Rusher** — attacks its weakest neighbour early and often.
- **Opportunist** — joins attacks on whoever is already losing ground or has low density.

Bots follow the same rules as the player; no cheating on ink.

## Content for the vertical slice

- Campaign of 8 seeded maps, rising from 2 bots on a small sheet to 5 bots on the
  full sheet. Three stars per map: win; win under a par time; win without ever
  dropping below half of your peak territory.
- Daily map: seeded by calendar date, best time of the day, day-streak counter.
- One power, unlocked after map 3, on a cooldown: **Blot** — tap to ink a small
  circle anywhere touching your territory.

## Feel

- Paper background generated in code (subtle fibre noise, off-white). Colony colours:
  indigo (player), vermilion, moss, ochre, plum, teal.
- Borders bleed: territory edges are soft and slightly irregular, like ink soaking
  into paper; freshly captured cells are darker for a moment and settle.
- Waves are visible as a darker advancing front. A big capture gives a soft "soak"
  sound and a small camera pulse; elimination of a colony gives a splash and a
  desaturating wash over its former land.
- HUD: your reserve as a bar with the cap and the "sweet spot" marked, land share of
  every colony as a stacked strip, the commit slider within thumb reach at the bottom.

## Sim (pure, in `src/sim/`)

`generateMap(seed, size, colonies)`, `MatchSim(map, seed, bots)` with `tick()` at a
fixed 10 Hz, `attack(colony, targetCell, percent)`, wave propagation over the border
frontier, growth, elimination, win/lose, bot decision step. Deterministic per seed.
Rendering must redraw only changed cells.

Unit tests must cover: generated land is connected and every start has room; growth
curve shape (peak near half cap, zero at cap); an attack never spends more than the
committed ink; capture cost rules; a wave stops when out of ink; elimination and win
conditions; same seed → same match; over many seeded matches each bot personality
both wins some and loses some against the others (no dominant or dead bot).

## Test hook

`state()` returns tick, land share per colony, player reserve and cap, phase, map id.
`act('attack', {cell, percent})`, `act('auto-play', {ticks})` (a simple built-in
player policy so the smoke test can finish a match), `act('fast-forward', ticks)`.

## Monetisation hooks (interface only, no provider)

Rewarded: one extra Blot charge per match. Interstitial: between matches only.

## Out of scope for the slice

Online play, alliances, map editor, more powers, real-world maps.

## Built (vertical slice)

**What exists.** Menu (live bot match bleeding across a sheet behind the title, Play, Daily, mute) →
Sheets (8 campaign cards: thumbnail, rivals, stars, best time, locks; daily card with today's best and
streak) → Match → Result (title, three stars each with its reason, land %, best stars, time,
Replay / Menu / Next sheet). Core pause menu, auto-pause on tab hide. Turkish + English.
Sim in `src/sim/` (pure, seeded): `mapgen.ts` (`generateMap`), `match.ts` (`MatchSim`: 10 Hz `tick()`,
`attack()`, waves, growth, capture costs, elimination, win/lose, Blot), `bots.ts`, `policy.ts` (naive
player policy for `auto-play`), `campaign.ts` (8 sheets, daily, stars), `progress.ts` (save rules).
Rendering in `src/view/inkmap.ts`: paper baked once (fibres, torn edges, shadow); ink on a canvas
texture at 8 px per cell where each pixel is a kernel-weighted vote of the 3×3 cells around a
noise-jittered position. Borders are therefore organic and soft, a narrow winning margin marks a border
where ink pools darker, freshly taken cells are darker and settle over ~1 s (that dark band is the
visible wave front). Only changed cells (and their 3×3 neighbourhood) are redrawn and uploaded.
HUD: land-share strip with the 70 % goal mark, reserve bar with cap and sweet-spot band (turns red
"Full: growth stopped!" at the cap), commit slider (10–100 %, 5 % detents, drag or tap, shows the ink a
tap will send) in thumb reach, 1×/2× toggle, Blot button with cooldown ring and rewarded "+" charge.
Taps snap to the nearest valid border cell within ~34 logical px (finger forgiveness).
Juice/audio (synthesized): drip on attack (pitch by commit), soak + small feedback + camera pulse when
a player wave takes ≥ 40 cells, splash + drop burst + grey wash + toast on elimination, hurt blip when
we lose land (rate-limited), Blot sound + medium feedback, star chimes on the result.
Test hook: state `{tick, mapId, phase, shares, alive, reserve, cap, commit, speed, blot, blotReady,
autoPlay, targets[{cell,x,y}], slider, speedButton, updateMs}`; actions `attack {cell, percent}`,
`auto-play {ticks}`, `fast-forward ticks`, `commit`, `speed`, `pause`, `blot {cell}`; sheets
`sheet {index}`, `daily`, `back`; result `next`. Probe scripts in `tests/tools/` (screenshots, perf,
a full match with real pointer input) are not part of the gate.

**Deviations from the concept, and why.**
- Full sheet is **48×66**, not 48×72: it matches the portrait play area between HUD and thumb zone
  (72 rows left wide side margins). Campaign sizes 32×44 → 48×66.
- **Attacker absorbs 50 % of the ink the defender loses** (`RULES.absorb`). Without it fighting was pure
  loss and the most passive bot won ~57 % of bot-vs-bot games; the defender still loses ink as specified.
- **Hard stop at 8 min of game time** (largest colony wins) so stalemates end; it fires in ~7 % of
  full-sheet bot matches.
- **Start positions are shuffled per match seed** (deterministic). Farthest-point sampling puts the first
  start in an extreme corner, and the player is colony 0, which gave a structural advantage.
  Thumbnails therefore show starts as neutral dots.
- Bots target a seeded pick weighted by cheapness (not strictly the thinnest), press a leader only above
  a share threshold (and only a near-winner once ≤ 3 colonies remain), and finish small colonies in the
  endgame. Turtle retaliation is limited to once per 6 s and only against a thinner attacker; the
  opportunist only joins attacks on a colony that a third party is hitting. All use `sim.attack()`.
- Difficulty also sets **patience** (easy bots fire before the sweet spot, i.e. waste growth like a new
  player, and spend freely). Easy bots that bank ink turned out *stronger*, not weaker.
- Blot is available from sheet 4 and on the daily sheet once sheet 3 is won; first charge after 10 s,
  then a 30 s cooldown; disc radius 2.6 cells, free, takes blank and enemy cells (defender loses ink).
  Rewarded: one instant recharge per match. Interstitial: every 3rd Replay/Next only.
- Daily streak counts consecutive days with a daily **win**; best time is the best winning time today.
- Colonies are told apart by colour only (no hatching pattern); see "not happy with".

**Tuning numbers** (`src/sim/rules.ts`, `src/sim/bots.ts`, `src/sim/campaign.ts`): start blot radius 2,
start reserve 18; cap = 20 + 2.4 × area; growth per tick at the sweet spot = 0.12 + 0.011 × area, scaled
by a curve 0.3 at empty → 1 at half cap → 0 at cap; blank cell 1 ink; enemy cell 0.8 + 1.3 × defender
density; defender loses its density per cell, attacker absorbs half of that; wave speed 2 + ink/40
cells/tick (max 7); win 70 %. Bots: reaction [26, 18, 12, 8] ticks by difficulty (rusher ×0.7),
commit multiplier [1.2, 0.95, 1, 1.1], patience [0.5, 0.8, 1, 1], leader share [–, 0.42, 0.30, 0.22];
difficulty ≥ 2 spends only the ink above ~45 % fill on blank paper.

**Balance evidence** (`tests/unit/balance.test.ts`, seeded, asserted in the gate):
- 150 bot-vs-bot matches on full sheets (3–5 colonies, difficulty 2, personalities rotated):
  wins turtle 42, rusher 48, opportunist 60 (28 / 32 / 40 %); game time p10 113 s, median 210 s,
  p90 443 s; 11 of 150 (7 %) hit the 8-min stop.
- Naive policy (taps 30 % whenever ≥ 35 % full) per campaign sheet, 24 match seeds each:
  c1 19, c2 12, c3 2, c4 1, c5 0, c6 0, c7 1, c8 1 wins. A hard bot in the player's seat wins c8
  2–4 of 24 (fair share 4), so the last sheet is beatable by good play (and the player has Blot).
- Campaign matches with the naive player run 75–130 s on the small early sheets (shorter than 2 min);
  full-sheet matches sit in the 2–4 min band.

**Performance** (headless Chromium, SwiftShader software GL, 4 shared cores at load 6–9 from other
builders, 390×844 @2×): full-size sheet mid-match (tick 660, 4 colonies) median frame 66.7 ms, p95 83 ms;
the untouched template menu measures 50 ms median in the same session, so the environment's software
rasterizer dominates. Game JS: `update()` p95 3.3–5.2 ms; script time 2.7–4.7 ms per frame. Not
measured on a real phone.

**Candidates for core:** `cpuCanvasTexture` (a canvas texture whose 2D context is CPU-backed;
`textures.createCanvas` takes pool canvases opened with `willReadFrequently: false`, so every WebGL
upload is a GPU readback); a slider widget; the result shell's toast slot collides with a title above
the card (games need to know the toast sits at safe top + 90).

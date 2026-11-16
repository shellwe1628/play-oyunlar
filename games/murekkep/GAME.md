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

## Built (vertical slice, after the playtest fix round)

**What exists.** Menu (live bot match on a dimmed sheet behind the title, Play, Daily, mute) →
Sheets (8 campaign cards: thumbnail, rivals, stars, best time, lock "Win the previous sheet"; daily
card with today's best and streak; thumbnails are generated one per frame after the cards are up) →
Match → Result (title saying how it ended and naming the winner's colour, three stars each with its
reason, land %, best stars, time, Replay / Menu / Next sheet). Core pause menu (now drawn on top),
auto-pause on tab hide. Turkish + English.

Sim in `src/sim/` (pure, seeded): `mapgen.ts`, `match.ts` (`MatchSim`: 10 Hz `tick()`, `attack()`,
waves, growth, capture costs, elimination, end reasons `share | last | time | eliminated`, Blot, fair
start), `bots.ts`, `policy.ts` (impatient and patient player policies), `campaign.ts`, `progress.ts`.
Rendering in `src/view/inkmap.ts`: paper baked once per sheet and cached; one ink layer per colony
(grey shade + alpha, 8 px per cell, kernel-vote ownership over a jittered position → organic soft
borders, ink pooling at borders, darker fresh ink = visible wave front, a subtle texture per colony),
tinted every frame by that colony's fill: thin ink is pale and watery, dense ink deep and opaque.
HUD (`src/view/hud.ts`, redraws only on change): land-share strip with a labelled "70% wins" mark;
reserve bar (count, current regrowth "+3.2/s" in gold inside the sweet spot, labelled sweet-spot band,
red "Full: growth stopped!" at the cap); commit slider that starts at 30 % every match; 1×/2× (kept);
Blot button with cooldown ring and rewarded "+" charge.
Onboarding: start hint "Tap paper next to your ink" (until the first wave or 12 s of game time),
"You" ring on the start, and four one-time tips stored in the save: first tap (what a tap sends),
first time the reserve is drained (ink regrows fastest in the gold band), first time at the cap
(growth stopped, spend), first time attacked (darker ink is denser and costs more).
Taps: only paper that is not yours, within a fingertip (~34 px) of your border, attacks. Own ink, a
hole, the desk, or paper too far away are refused with a red cross and the reason; nothing is spent.
A wave that cannot pay for its first cell is refused (no sound, no ink).
Test hook: state `{tick, mapId, phase, shares, alive, reserve, cap, commit, speed, blot, blotReady,
autoPlay, targets[{cell,x,y}], ownCell, lastReject, intro, hint, tip, slider, speedButton, updateMs}`;
actions `attack {cell, percent}`, `tap {x, y}`, `auto-play {ticks, policy?}` (patient by default),
`fast-forward ticks`, `commit`, `speed`, `pause`, `blot {cell}`; sheets `sheet {index}`, `daily`,
`back`; result `next` (state adds `title`, `starsLit`). Probe scripts in `tests/tools/` are not part
of the gate.

**Deviations from the concept, and why.**
- Full sheet is **48×66**, not 48×72 (fills the portrait play area).
- **Attacker absorbs 50 % of the ink the defender loses**; enemy cells cost **1.6 + 1.3 × density**
  (never cheaper than blank paper, 1.0). Without absorption fighting was pure loss; with enemy cells
  cheaper than blank, any thin player was the cheapest food on the page.
- **Reserve never exceeds the cap** (refund/absorption overflow spills), so "Ink n / cap" is honest.
- **8-minute stop**: most land wins, then the larger reserve; an exact tie is never the player's.
- **Start positions** are shuffled per match seed; on sheets 1–3 the player gets the start with the
  most room (`fairStart`).
- **Difficulty levels**: 0 passive (blank only), 1 defensive (blank + proportionate hit back; closes
  stalemates after 4 min), 2–3 full personalities (sweet-spot discipline, leader pressure; 3 also
  disciplined in fights and presses a near-winner in small endgames). Sheet 1 has a single rival.
- Bots read reserves/densities that the HUD does not print as numbers; the ink look shows them.
- Blot from sheet 4 and on the daily sheet once sheet 3 is won; 30 s cooldown; one rewarded charge.
- Daily: the date is fixed when the sheet is opened (a match across midnight counts for that day);
  streak = consecutive days with a daily win.
- Colony colours (Okabe–Ito-like): every pair ≥ 53 ΔE, ≥ 26 under simulated deuteranopia, ≥ 35
  under protanopia, plus a per-colony texture.

**Tuning numbers** (`src/sim/rules.ts`, `bots.ts`, `campaign.ts`): start blot radius 2, reserve 18;
cap = 20 + 2.4 × area; growth/tick at the sweet spot = 0.12 + 0.011 × area, scaled 0.3 (empty) → 1
(half cap) → 0 (cap); blank cell 1; enemy cell 1.6 + 1.3 × density; defender loses its density per
cell, attacker absorbs half; waves 2 + ink/40 cells/tick (max 7); win 70 %; stop at 4800 ticks.
Bots: reaction [26, 18, 12, 8] ticks (rusher ×0.7), commit ×[1.2, 0.95, 1, 1.1], patience
[0.5, 0.8, 1, 1], leader share [–, –, 0.30, 0.22]. Lineups: c1 T0 · c2 T0 O0 · c3 T0 R0 O0 ·
c4 R1 O0 T1 · c5 T2 R1 O0 R0 · c6 O2 T2 R1 O2 · c7 O2 T3 R2 T2 O2 · c8 O3 O3 O3 R3 R3.

**Balance evidence** (60 match seeds per cell; the gate's balance test asserts the targets on 40):

| sheet | rivals | impatient (never waits, 30–45 %) | patient (sweet spot, blank first) |
|---|---|---|---|
| 1 | T0 | 100 % (median 110 s) | 100 % (69 s) |
| 2 | T0 O0 | 100 % (143 s) | 100 % (81 s) |
| 3 | T0 R0 O0 | 100 % (163 s) | 100 % (89 s) |
| 4 | R1 O0 T1 | 0 % (317 s) | 98 % (112 s) |
| 5 | T2 R1 O0 R0 | 0 % (85 s) | 65 % (123 s) |
| 6 | O2 T2 R1 O2 | 0 % (99 s) | 53 % (173 s) |
| 7 | O2 T3 R2 T2 O2 | 0 % (69 s) | 52 % (204 s) |
| 8 | O3 O3 O3 R3 R3 | 0 % (66 s) | 42 % (228 s) |

Bot-vs-bot, 150 full-sheet matches (3–5 colonies, difficulty 2): turtle 41, rusher 61, opportunist 48
wins; p10 131 s, median 219 s, p90 480 s; 15 (10 %) end at the 8-minute stop.
A real-pointer run (touch taps + slider drags, `tests/tools/real-play.mjs`) wins sheet 1 with 3 stars.

**Performance.** Not measurable on a phone here. Cheap wins taken: HUD widgets redraw only on change;
paper, jitter and grain cached per sheet (menu demo cycles 3 fixed sheets); ink density is a tint
(no redraw); thumbnails are generated one per frame; canvases are CPU-backed (`cpuCanvasTexture`).
Earlier measurement (software GL, loaded machine): `update()` p95 3–5 ms on the full sheet.

**Candidates for core:** `cpuCanvasTexture`; a slider widget; a one-time-tips helper.

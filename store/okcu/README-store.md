# Store images — provenance (Sallanan Okçular / Noodle Archers)

The Play app ships the 3D build, `apps/okcu-3d`, so every listing image shows that build. All of
it is regenerated with `node store/tools/all.mjs okcu` (see `store/tools/README.md`).

## What each image is captured from

Every phone screenshot is a real frame of `apps/okcu-3d` (built unchanged from its own sources,
three.js in Chromium with software WebGL, 720×1280 logical at 2× = 1440×2560, framed to
1080×1920 with a caption by `compose.mjs`). The save behind each shot comes from a career played
headless with the game's own rules on the 3D build's difficulty ('hard'): `career.mjs` (the
CAREFUL scripted player of `games/okcu/src/sim/aimbot.ts`, banking with the game's own
`bank*` / `unlockFeats`, forging with `attemptForge`). Runs start from the chapter select
(`Game.startRun({ chapter })` with a fixed seed) and are played by `capture-bot.mjs` (the same
scripted player, shooting through the app's release path). No world field is written, nothing
keeps the player alive; a lost run is retried with the next seed.

| # | id | What it shows | How it is reached |
|---|---|---|---|
| 1 | `aim` | Chapter 1 (Sunny Meadow), stage 3: the archer drawing the bow (Gilded Bow +10) at an archer on a floating island, the dotted arc on screen | played to wave 3, then a real touch drag held at the solver's aim |
| 2 | `headshot` | Chapter 2 (Frozen Peaks), stage 3: a headshot knockout in slow motion, "HEADSHOT!" / "KAFADAN!", coins flying | played to wave 10, then a real drag-and-release at the head; frames step until the sim's own headshot `hit` event |
| 3 | `glow` | Chapter 4 (Lantern Night), stage 2: the fully armoured archer (health upgrades maxed) drawing the Mythic Bow +20 with its prismatic glow | end-of-career save, played to wave 23, drag held |
| 4 | `forge` | The forge: Mythic Bow +19 → +20, damage ×2.70 → ×2.80, the printed chance (15 %), the bow rising and blazing magenta during the strike | taps on Forge and on "Forge N" with the save from just before the career's +20 strike |
| 5 | `boss` | Chapter 3 (Sunset Dunes), stage 7: the boss with its weak spot (the ringed head) as the archer draws on it | played from the chapter select up to the boss, drag held at the head |
| 6 | `bonus` | The target-gallery bonus round after Chapter 1: arrows striking balloon targets, "3 hits · +12" | played through chapter 1 and its boss; the scripted player's bonus aim until a `bonusHit` event |
| 7 | `ranks` | The ranks ladder (Legend, progress breakdown, 12 ranks) | tap on Ranks with the end-of-career save |

The feature graphic (`art.mjs`) is code-drawn (backdrop, the game's name and tagline in Nunito)
around two crops of captures 3 and 2 above. The icon set is code-drawn (`store/tools/lib/icons.mjs`,
bow-and-arrow emblem) and unchanged from the 2D listing.

## Characters and art

- The archers in the 3D scenes are the Mixamo character **"Erika Archer"** (with her bow and
  arrow, and Mixamo animation clips), loaded from `apps/okcu-3d/public/assets/*.fbx`. Check
  Mixamo's licence terms before publishing a build or images that contain them.
- Everything else is code-drawn: the islands, skies, props, effects, HUD, menus and forge of the
  3D app, and the screenshot frames, captions, feature graphic and icons of the store pipeline.
  Apart from the Mixamo character and its animations, no third-party or AI-generated art is used
  (text is set in Nunito, OFL).

## Known capture notes

- `apps/okcu-3d/src/view/fx.ts` takes the language of its world call-outs ("HEADSHOT!",
  "CRIT!") from `<html lang>`, which `index.html` sets to `tr`, and ignores `?lang=en`. The
  listing config sets `htmlLang: true`, so the English captures give the page `lang="en"`
  (what an English page should show). In the app as built, those call-outs are Turkish for
  everyone until fx.ts follows the UI language.
- The 3D app's DOM animations run on real time, not on Playwright's fake clock; the forge shot
  slows them (`g.animRate`) so they keep pace with the stepped frames.

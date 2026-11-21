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
| 1 | `aim` | Chapter 1 (Sunny Meadow), stage 3: the archer drawing the bow at an archer on a floating island, the dotted arc on screen | welcome chest collected, played to wave 3, then a real touch drag held at the solver's aim |
| 2 | `headshot` | Chapter 2 (Frozen Peaks), stage 3: a headshot knockout in slow motion, "HEADSHOT!" / "KAFADAN!" | played to wave 10, then a real drag-and-release at the head; frames step until the sim's own headshot `hit` event |
| 3 | `home` | The tabbed main menu (Shop · Weapons · Home · Ranks · Events) over the live 3D scene: rank and POWER, coins, chapter card, chest and daily buttons, Play | end-of-career save; the welcome gold chest tapped through (skip, Collect) like a player |
| 4 | `weapons` | The Weapons tab: the archer card and the six weapons with levels and shard bars | the same, then a tap on Weapons |
| 5 | `chest` | The welcome gold chest opening: lid off, "+1778" coins, sling shards flying to the Sling card | the save after the career's run that reached bow +12; the app moves it to the arsenal on load and presents the chest (`hud.ts` welcome), rolled by `chestRng` from the save; frames stepped to mid-animation |
| 6 | `spear` | Chapter 4 (Lantern Night), stage 2: a volley of spears in flight | end-of-career save, Spear picked on the Weapons tab (card tap, Select), a run played to wave 23, a real drag-and-release; caught 0.6 s into the flight |
| 7 | `firework` | Chapter 5 (Ember Caldera), stage 1: a firework rocket streaking at an archer | Firework Tube picked the same way, played to wave 29, a real drag-and-release; caught 0.1 s into the flight |
| 8 | `boss` | Chapter 3 (Sunset Dunes), stage 7: the boss with its weak spot (the ringed head) as the archer draws on it | played from the chapter select up to the boss, drag held at the head |

The staged saves are 2D saves from before the arsenal (save v3): the app moves them over on load
(`sim/arsenal.ts migrateArsenal`: the bow's level from the forged bow, the beaten bosses' weapons
unlocked, one gold welcome chest), exactly as for a player updating from the forge build.

The feature graphic (`art.mjs`) is code-drawn (backdrop, the game's name and tagline in Nunito)
around two crops of captures 7 and 2 above. The icon set is code-drawn (`store/tools/lib/icons.mjs`,
bow-and-arrow emblem) and unchanged from the 2D listing.

## Characters and art

- The archers in the 3D scenes are the Mixamo character **"Erika Archer"** (with her bow and
  arrow, and Mixamo animation clips), loaded from `apps/okcu-3d/public/assets/*.fbx`. Check
  Mixamo's licence terms before publishing a build or images that contain them.
- Everything else is code-drawn: the islands, skies, props, effects, HUD, menus, weapons and chests of
  the 3D app, and the screenshot frames, captions, feature graphic and icons of the store pipeline.
  Apart from the Mixamo character and its animations, no third-party or AI-generated art is used
  (text is set in Nunito, OFL).

## Known capture notes

- `apps/okcu-3d/src/view/fx.ts` takes the language of its world call-outs ("HEADSHOT!",
  "CRIT!") from `<html lang>`, which `index.html` sets to `tr`, and ignores `?lang=en`. The
  listing config sets `htmlLang: true`, so the English captures give the page `lang="en"`
  (what an English page should show). In the app as built, those call-outs are Turkish for
  everyone until fx.ts follows the UI language.
- The 3D app's DOM animations run on real time, not on Playwright's fake clock; the menu and
  chest shots slow them (`g.animRate`) so they keep pace with the stepped frames.

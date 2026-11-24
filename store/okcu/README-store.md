# Store images — provenance (Sallanan Okçular / Noodle Archers)

The Play app ships the 3D build, `apps/okcu-3d`, so every listing image shows that build. All of
it is regenerated with `node store/tools/all.mjs okcu` (see `store/tools/README.md`).

## What each image is captured from

Every phone screenshot is a real frame of `apps/okcu-3d` (built unchanged from its own sources,
three.js in Chromium with software WebGL, 720×1280 logical at 2× = 1440×2560, framed to
1080×1920 with a caption by `compose.mjs`, and to 1320×2868 for the App Store by `appstore.mjs`).
The save behind each shot comes from a career on the 3D build, played headless from a fresh save
with the game's own rules (`career.mjs`): the CAREFUL scripted player of
`games/okcu/src/sim/aimbot.ts` plays every run on the 'hard' curve with the selected weapon at its
level, each run is banked the way `apps/okcu-3d/src/ui/progress.ts` banks it (records, boss
rewards and weapons, achievements, the run-end chest), the free chest is claimed when its timer is
up, every chest is opened with the game's own rolls and coins and shards are spent on the bow the
way the economy test's player does. No save comes from the retired forge or from the one-off
arsenal migration, so no shot shows the "welcome gift" that only migrated saves get. Runs start
from the chapter select (`Game.startRun({ chapter })`) or, for a mode, as the Events tab starts it
(`Game.startRun({ mode })`), with a fixed seed, and are played by `capture-bot.mjs` (the same
scripted player, shooting through the app's release path). Nothing keeps the player alive; a lost
run is retried with the next seed.

| # | id | What it shows | How it is reached |
|---|---|---|---|
| 1 | `aim` | Chapter 1 (Sunny Meadow), stage 3: the archer drawing at an archer on a floating island, the dotted arc on screen | early save (bow 4), played to wave 3, then a real touch drag held at the solver's aim |
| 2 | `headshot` | Chapter 2 (Frozen Peaks): a headshot knockout in slow motion | bow 7 save, played to wave 10, then a real drag-and-release at the head; frames step until the sim's own headshot `hit` event |
| 3 | `blitz` | Blitz in Sunset Canyon, the camera turned to Angled, drawing on an archer | end-of-career save, the mode started, the HUD's camera button tapped, played ~10 s, a real drag held |
| 4 | `home` | The tabbed main menu (Shop · Weapons · Home · Ranks · Events) over the live 3D scene | end-of-career save (bow 10, every chapter and boss, armour) |
| 5 | `weapons` | The Weapons tab: the six weapons with levels and shard bars | the same, then a tap on Weapons |
| 6 | `chest` | The free wooden chest of the 4-hour timer opening, its odds at the top | the same; the Home tab's chest button, then "Open" (no ad); frames stepped to mid-animation |
| 7 | `bossrush` | Boss Rush in Sunset Canyon, the camera turned to Low, drawing on the first boss's weak spot | the mode started, the camera button tapped twice, played until the boss stands, a real drag held at the head |
| 8 | `firework` | Chapter 5 (Ember Caldera): a firework rocket streaking at an archer | Firework Tube picked on the Weapons tab (card tap, Select), back to Home, a run played to wave 29, a real drag-and-release; caught 0.1 s into the flight |

The feature graphic (`art.mjs`) is code-drawn (backdrop, the game's name and tagline in Nunito)
around two crops of captures 8 and 2 above. The icon set is code-drawn (`store/tools/lib/icons.mjs`,
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

- `apps/okcu-3d/src/view/fx.ts` takes the language of its world call-outs ("HEADSHOT!", "CRIT!")
  from `<html lang>`, which `src/main.ts` sets from the device language. The listing config sets
  `htmlLang: true` as well, so each capture shows the call-outs a phone in that language shows.
- The 3D app's DOM animations run on real time, not on Playwright's fake clock; the menu, mode and
  chest shots slow them (`g.animRate`) so they keep pace with the stepped frames.
- The captures use the web build (its test hook `window.__okcu3d` and the injected bot); the store
  build drops the hook (`STORE_BUILD`), but everything a shot shows is the store build's own UI.

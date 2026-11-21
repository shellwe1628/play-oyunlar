# Launcher icon — Sparkrise

Drawn with code by `store/tools/art.mjs kivilcim` (emblem in `store/tools/lib/icons.mjs`); regenerate, do not hand-edit.

| File | What | Use |
|---|---|---|
| `icon.svg` / `icon-512.png` | 512×512, 32-bit, fully opaque, full-bleed square | Google Play icon (same as `metadata/android/*/images/icon.png`) |
| `ic_launcher_background.svg` / `.png` | 432×432 opaque gradient + glow | adaptive icon background layer (108 dp) |
| `ic_launcher_foreground.svg` / `.png` | 432×432 transparent, emblem inside the 66 dp safe circle (r ≤ 132 px) | adaptive icon foreground layer |
| `ic_launcher_monochrome.svg` / `.png` | 432×432 alpha-only emblem (outline opaque, fills 42 %) | Android 13+ themed icon layer |
| `ic_launcher_legacy.svg` / `ic_launcher_legacy-512.png` | 512×512 rounded-square plate, transparent corners | legacy (API < 26) launcher icon; scale down to 48/72/96/144/192 px for mdpi…xxxhdpi |

Adaptive layers are PNG at 432 px (= 108 dp at xxxhdpi); the SVGs are the same drawings at any size.

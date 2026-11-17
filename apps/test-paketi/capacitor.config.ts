// Capacitor config of the multi-game test APK (debug builds only, for sideloading).
// tools/apk.mjs fills dist/ (launcher at the root, each game under dist/<slug>/) and builds it.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.playoyunlar.testpaketi',
  appName: 'Play Oyunlar Test',
  webDir: 'dist',
  backgroundColor: '#12142a',
  // Default https://localhost origin: one origin for the launcher and all games (saves are keyed
  // per game, see README). No remote server, no cleartext, no mixed content.
  android: { allowMixedContent: false },
  plugins: {
    // Core's built-in SystemBars plugin: draw edge to edge and pass the insets to the page as
    // env(safe-area-inset-*) (WebView >= 140) — every page sets viewport-fit=cover. DARK = light
    // icons, for the dark backgrounds of the launcher and every game.
    SystemBars: { insetsHandling: 'css', style: 'DARK', initialViewportFitValueHint: 'cover' },
  },
};

export default config;

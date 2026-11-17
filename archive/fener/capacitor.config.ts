// Capacitor (Android/iOS) wrapper config. UNVERIFIED in this repo's build environment:
// there is no Android SDK or Xcode here. See .github/workflows/android.yml.
import type { CapacitorConfig } from '@capacitor/cli';
import meta from './oyun.config.json' with { type: 'json' };

const config: CapacitorConfig = {
  appId: meta.appId,
  appName: meta.title,
  webDir: 'dist',
  backgroundColor: '#1b1f3b',
  android: { allowMixedContent: false },
};

export default config;

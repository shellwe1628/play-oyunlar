import { defineConfig, type Plugin } from 'vite';

/**
 * CrazyGames builds (`VITE_OYUN_PLATFORM=crazygames npm run build`) need the portal SDK as a
 * classic script before the game module. UNVERIFIED against the live portal.
 */
function crazyGamesSdk(): Plugin {
  return {
    name: 'oyun-crazygames-sdk',
    transformIndexHtml(html) {
      if (process.env.VITE_OYUN_PLATFORM !== 'crazygames') return html;
      return html.replace('</head>', '    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  </head>');
    },
  };
}

export default defineConfig({
  // Relative asset paths: the same dist/ works on a portal iframe, a sub-path and in Capacitor.
  base: './',
  plugins: [crazyGamesSdk()],
  build: {
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified; the gate enforces the real budget.
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
});

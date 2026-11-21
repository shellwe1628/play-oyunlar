import { smokeConfig } from '@oyun/core/e2e';
import meta from './oyun.config.json' with { type: 'json' };

export default smokeConfig({
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  gameDir: import.meta.dirname,
});

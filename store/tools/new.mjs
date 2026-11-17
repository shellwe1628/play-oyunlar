// node store/tools/new.mjs <slug>
// Writes a starter store/<slug>/listing.config.mjs and empty text files for a new game. Fill
// them in (shots, captions, texts), then run node store/tools/all.mjs <slug>.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configPath } from './lib/config.mjs';
import { LOCALES, metaDir, REPO, slugArg } from './lib/paths.mjs';

const slug = slugArg();
const p = configPath(slug);
if (existsSync(p)) {
  console.error(`${p} exists; not overwriting.`);
  process.exit(1);
}
const meta = JSON.parse(readFileSync(join(REPO, 'games', slug, 'oyun.config.json'), 'utf8'));
mkdirSync(join(REPO, 'store', slug), { recursive: true });
writeFileSync(
  p,
  `// Store listing config for ${meta.title} (games/${slug}). See store/fosil/listing.config.mjs and
// store/okcu/listing.config.mjs for complete examples; store/tools/README.md explains the fields.
export default {
  slug: '${slug}',
  name: { 'en-US': '${meta.title}', 'tr-TR': 'TODO' },
  seed: 1,
  look: { bg: ['#333344', '#111122'], band: ['#ffffff'], accent: '#ffcc33', ink: '#111122', text: '#ffffff', stroke: 0, pattern: 'sparks' },
  // emblem: a name in store/tools/lib/icons.mjs EMBLEMS (add a drawing there for a new game)
  icon: { emblem: 'TODO', bg: ['#555566', '#222233'], glow: '#ffffff', mono: true },
  async stage() {
    return {};
  },
  storageFor: (save) => ({ 'oyun:${slug}:save': save }),
  shots: [
    {
      id: 'start',
      caption: { 'en-US': 'TODO', 'tr-TR': 'TODO' },
      async run(g) {
        await g.run(1000);
      },
    },
  ],
  feature: { tagline: { 'en-US': 'TODO', 'tr-TR': 'TODO' }, cards: [['start', 0, 0, 720, 1280]] },
};
`,
);
for (const locale of LOCALES) {
  const d = metaDir(slug, locale);
  mkdirSync(join(d, 'changelogs'), { recursive: true });
  for (const f of ['title.txt', 'short_description.txt', 'full_description.txt', 'changelogs/default.txt']) if (!existsSync(join(d, f))) writeFileSync(join(d, f), '');
}
console.log(`wrote ${p} and empty texts; fill them in, then: node store/tools/all.mjs ${slug}`);

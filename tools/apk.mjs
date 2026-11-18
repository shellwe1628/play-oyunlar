#!/usr/bin/env node
// TEST APKs for sideloading (debug builds, never for Google Play).
//   npm run apk                 → the bundle "Play Oyunlar Test" (com.playoyunlar.testpaketi):
//                                 a launcher with every real game
//   npm run apk -- <slug>       → one game as its own test app (com.playoyunlar.<name>.test,
//                                 label "<title> (Test)"), e.g. npm run apk -- kivilcim
//   npm run apk -- all          → all four
// Output: build/test-apk/<name>-<versionCode>.apk for each, plus build/test-apk/versions.json
// (the manifest the in-app updater reads; it lists the apps built in this run).
//
// Every test app carries the in-app updater (apps/test-paketi/src/update/ + native/
// TestUpdatePlugin.java): it checks the rolling GitHub release `test-latest` (tools/test-apk/
// release.mjs) and offers newer APKs. The Play path (tools/aab.mjs) shares none of it.
// All are signed with the committed, PUBLIC test-only key tools/test-imza/debug.keystore (see its
// README) so local and GitHub builds update each other on the phone.
//
// Needs: Node >= 22.12, JDK 21, an Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT) with
// platforms;android-36 and build-tools. See apps/test-paketi/README.md for the exact install.
// Steps per app: web build (VITE_OYUN_PLATFORM=web) → updater script added to every page →
// offline/relative-path checks → Capacitor project in build/test-apk/work/<key>/ (created once,
// synced every run) → native patches applied to pristine template copies → Gradle assembleDebug
// → checks on the APK (id, labels, version, permissions, full-screen themes, provider, signature, contents).
// Env: OYUN_GRADLE=<gradle binary> uses that instead of the project's ./gradlew (same version).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { foregroundVector, adaptiveIconXml, ICON_BG, LEGACY_SIZES, legacyIconPng } from '../apps/test-paketi/native/icon.mjs';
import { findIconSource, writeIcon } from './aab/icon.mjs';
import { checkThemeDump, fullScreenStyles } from './aab/theme.mjs';
import { ROOT } from './template.mjs';
import { buildManifest, MANIFEST_FILE, releaseBase, repository } from './test-apk/release.mjs';

/** Games in the bundle, in launcher order (must match apps/test-paketi/src/games.ts). */
export const SLUGS = ['kivilcim', 'okcu', 'fosil'];
const APP = join(ROOT, 'apps', 'test-paketi');
const OUT_DIR = join(ROOT, 'build', 'test-apk');
const WORK = join(OUT_DIR, 'work');
const BIN = join(ROOT, 'node_modules', '.bin');
const UPDATER = 'oyun-test-update.js';

/** The committed public test key (tools/test-imza/README.md). Never used by tools/aab.mjs. */
const TEST_KEY = {
  file: join(ROOT, 'tools', 'test-imza', 'debug.keystore'),
  alias: 'androiddebugkey',
  password: 'android',
  sha256: 'BD:03:C5:F1:66:FD:A1:A6:BD:14:71:C1:A7:87:BF:A8:43:80:E7:11:E3:2E:EE:60:92:05:F0:3A:E0:FB:8C:64',
};

/**
 * http(s) strings that may appear in the built bundles because they are not requests:
 * XML namespaces Phaser uses to create DOM/SVG nodes, and Phaser's console banner link
 * (the banner is disabled by core: `banner: false`). Anything else fails the build.
 */
const ALLOWED_URLS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'https://phaser.io', 'https://phaser.io/']);

const t0 = Date.now();
const step = (msg) => console.log(`\n=== ${msg}`);

function fail(msg) {
  console.error(`\napk: FAILED\n${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`$ ${relative(ROOT, opts.cwd ?? ROOT) || '.'}: ${cmd.replace(`${BIN}/`, '')} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    // stdin closed: no interactive prompt (e.g. Capacitor's telemetry question) can block.
    stdio: ['ignore', opts.capture ? 'pipe' : 'inherit', opts.capture ? 'pipe' : 'inherit'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
  });
  if (r.error) fail(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${r.status} (cwd ${relative(ROOT, opts.cwd ?? ROOT) || '.'})${opts.capture ? `\n${r.stdout}${r.stderr}` : ''}`);
  return opts.capture ? `${r.stdout}${r.stderr}` : '';
}

function git(args) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

/** Replace exactly one match of `re`, or fail with a readable message (template drift). */
function replaceOnce(text, re, replacement, what) {
  const matches = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  if (!matches || matches.length !== 1) fail(`cannot patch ${what}: expected one match of ${re}, found ${matches?.length ?? 0}`);
  return text.replace(re, replacement);
}

/** Android string resource text: XML-escaped, apostrophes and quotes backslash-escaped. */
const androidString = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
const sha256File = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ---------------------------------------------------------------- targets
/** The four test apps. Per-game ids/titles come from store/apps.json (read only). */
function allTargets() {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
  const bundle = {
    key: 'paket',
    applicationId: 'com.playoyunlar.testpaketi', // unchanged: updates the copy already on the phone
    label: { en: 'Play Oyunlar Test', tr: 'Play Oyunlar Test' },
    games: SLUGS,
    launcher: true,
    fileBase: 'play-oyunlar-test',
    background: ICON_BG,
  };
  const games = cfg.apps.map((app) => ({
    key: app.slug,
    // Play id + ".test": a separate app that can sit next to the Play version.
    applicationId: `${app.applicationId}.test`,
    label: { en: `${app.title['en-US']} (Test)`, tr: `${app.title['tr-TR']} (Test)` },
    games: [app.slug],
    launcher: false,
    fileBase: `${app.slug}-test`,
    background: app.background,
    icon: app.icon,
  }));
  return [bundle, ...games];
}

function pickTargets(arg) {
  const all = allTargets();
  const usage = `usage: npm run apk [-- all | paket | ${all.slice(1).map((t) => t.key).join(' | ')}]`;
  if (!arg || arg === 'paket' || arg === 'bundle') return [all[0]];
  if (arg === 'all') return all;
  const t = all.find((x) => x.key === arg);
  if (!t) fail(`unknown app "${arg}"\n${usage}`);
  return [t];
}

// ---------------------------------------------------------------- preflight
function preflight(targets) {
  step('preflight');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) fail(`Node >= 22.12 needed, found ${process.versions.node}`);

  const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (java.error) fail('java not found on PATH: install JDK 21 (Capacitor 8 / AGP 8.13 need it).');
  const jv = /version "(\d+)/.exec(`${java.stderr}${java.stdout}`);
  if (!jv || Number(jv[1]) < 21) fail(`JDK 21 needed, java -version says: ${(java.stderr || java.stdout).split('\n')[0]}`);

  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const howTo = 'Install it as in apps/test-paketi/README.md ("Android SDK kurulumu"), then e.g.\n  export ANDROID_HOME=/root/android-sdk';
  if (!sdk) fail(`Android SDK not found: neither ANDROID_HOME nor ANDROID_SDK_ROOT is set.\n${howTo}`);
  if (!existsSync(sdk)) fail(`Android SDK not found: ${sdk} (from ANDROID_HOME/ANDROID_SDK_ROOT) does not exist.\n${howTo}`);
  const platforms = existsSync(join(sdk, 'platforms')) ? readdirSync(join(sdk, 'platforms')) : [];
  if (!platforms.includes('android-36')) fail(`Android SDK at ${sdk} has no platforms/android-36 (found: ${platforms.join(', ') || 'none'}).\n${howTo}`);
  const buildTools = existsSync(join(sdk, 'build-tools')) ? readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  const tools = buildTools.length ? join(sdk, 'build-tools', buildTools.at(-1)) : null;
  if (!tools || !['aapt', 'aapt2', 'apksigner'].every((f) => existsSync(join(tools, f)))) fail(`Android SDK at ${sdk} has no build-tools with aapt, aapt2 and apksigner.\n${howTo}`);
  for (const t of targets) for (const slug of t.games) if (!existsSync(join(ROOT, 'games', slug, 'oyun.config.json'))) fail(`games/${slug} is missing`);

  // The test key: present, opens with the known passwords, and is exactly the expected key.
  if (!existsSync(TEST_KEY.file)) fail(`test signing key missing: ${relative(ROOT, TEST_KEY.file)} (see tools/test-imza/README.md)`);
  const list = spawnSync('keytool', ['-list', '-v', '-keystore', TEST_KEY.file, '-storepass', TEST_KEY.password, '-alias', TEST_KEY.alias], { encoding: 'utf8' });
  const sha = /SHA256:\s*([0-9A-F:]+)/.exec(list.stdout ?? '')?.[1];
  if (list.status !== 0 || sha !== TEST_KEY.sha256) fail(`tools/test-imza/debug.keystore is not the expected test key (SHA-256 ${sha ?? 'unreadable'}, expected ${TEST_KEY.sha256})`);
  console.log(`node ${process.versions.node}, java ${jv[1]}, SDK ${sdk} (android-36, build-tools ${buildTools.join(', ')})`);
  console.log(`test key ${relative(ROOT, TEST_KEY.file)}: SHA-256 ${sha}`);
  return { sdk, tools };
}

// ---------------------------------------------------------------- web
function buildUpdater() {
  step(`updater script (${UPDATER})`);
  const out = join(OUT_DIR, 'updater');
  run(join(BIN, 'vite'), ['build', '-c', 'vite.updater.config.ts', '--outDir', out, '--logLevel', 'warn'], { cwd: APP });
  const file = join(out, UPDATER);
  if (!existsSync(file)) fail(`vite did not write ${relative(ROOT, file)}`);
  return file;
}

/** Folders of a target's web root that hold an index.html, and where each game's JS is. */
const pages = (t) => (t.launcher ? ['', ...t.games] : ['']);
const gameDirs = (t, www) => (t.launcher ? t.games.map((s) => [s, join(www, s)]) : [[t.games[0], www]]);

function buildWeb(t, www, info) {
  if (t.launcher) {
    step(`${t.key}: launcher`);
    run(join(BIN, 'vite'), ['build', '--outDir', www, '--emptyOutDir'], { cwd: APP, env: { OYUN_BUILD_DATE: info.date, OYUN_BUILD_COMMIT: info.commit } });
  }
  for (const [slug, out] of gameDirs(t, www)) {
    step(`${t.key}: game ${slug} → ${relative(ROOT, out)} (web platform adapter)`);
    // VITE_OYUN_PLATFORM=web: core's build-time choice beats the Capacitor native shell, so
    // rewarded ads resolve 'granted' in test APKs. Only these builds get it; the games'
    // own dist/ and the gate are untouched.
    run(join(BIN, 'vite'), ['build', '--base', './', '--outDir', out, '--emptyOutDir'], {
      cwd: join(ROOT, 'games', slug),
      env: { VITE_OYUN_PLATFORM: 'web' },
    });
  }
}

/** The updater goes next to every index.html and is loaded with a classic deferred script. */
function addUpdater(t, www, updater) {
  for (const dir of pages(t)) {
    const html = join(www, dir, 'index.html');
    if (!existsSync(html)) fail(`missing ${relative(ROOT, html)}`);
    copyFileSync(updater, join(www, dir, UPDATER));
    writeFileSync(html, replaceOnce(readFileSync(html, 'utf8'), /<\/head>/, `  <script defer src="./${UPDATER}"></script>\n  </head>`, `${relative(ROOT, html)} </head>`));
  }
}

/** Every path relative, nothing fetched from the network, the web adapter and updater in. */
function checkWeb(t, www) {
  step(`${t.key}: check web folder`);
  const problems = [];
  const files = filesUnder(www);
  for (const dir of pages(t)) {
    const html = join(www, dir, 'index.html');
    if (!existsSync(html)) {
      problems.push(`missing ${relative(www, html)}`);
      continue;
    }
    const text = readFileSync(html, 'utf8');
    if (!text.includes('viewport-fit=cover')) problems.push(`${relative(www, html)}: no viewport-fit=cover`);
    if (!text.includes(`src="./${UPDATER}"`)) problems.push(`${relative(www, html)}: updater script not loaded`);
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
      const url = m[1];
      if (url.startsWith('data:')) continue;
      if (!url.startsWith('./')) problems.push(`${relative(www, html)}: non-relative URL ${url}`);
      else if (!existsSync(join(www, dir, url))) problems.push(`${relative(www, html)}: ${url} does not exist`);
    }
  }
  for (const f of files) {
    const rel = relative(www, f);
    if (f.endsWith('.css')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/url\(([^)]+)\)/g)) {
        const url = m[1].replace(/["']/g, '');
        if (url.startsWith('data:')) continue;
        if (/^(\/|https?:)/.test(url)) problems.push(`${rel}: non-relative url(${url})`);
        else if (!existsSync(join(f, '..', url))) problems.push(`${rel}: url(${url}) does not exist`);
      }
    }
    if (/\.(js|css|html)$/.test(f)) {
      // The updater holds no URL either: the release address lives only in the native plugin.
      for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+/g)) {
        const url = m[0].replace(/[),;'"]+$/, '');
        if (!ALLOWED_URLS.has(url)) problems.push(`${rel}: external URL ${url}`);
      }
    }
  }
  for (const [slug, dir] of gameDirs(t, www)) {
    const js = filesUnder(dir).filter((f) => f.endsWith('.js') && !f.endsWith(UPDATER));
    // Vite inlines import.meta.env.VITE_OYUN_PLATFORM as a string literal.
    if (!js.some((f) => /forced:\s*["'`]web["'`]/.test(readFileSync(f, 'utf8')))) problems.push(`${slug}: web platform choice not found in the bundle`);
  }
  if (problems.length) fail(`web folder check:\n  ${problems.join('\n  ')}`);
  const kb = Math.round(files.reduce((s, f) => s + statSync(f).size, 0) / 1024);
  console.log(`ok: ${files.length} files, ${kb} KB, ${t.launcher ? 'launcher + ' : ''}${t.games.join(', ')}; relative paths, no external URLs, web adapter, updater on ${pages(t).length} page(s)`);
}

// ---------------------------------------------------------------- native
/** Template files the patch step rewrites: kept as pristine copies so every run patches the original. */
const PRISTINE = ['app/src/main/AndroidManifest.xml', 'app/build.gradle', 'app/src/main/res/values/strings.xml', 'app/src/main/res/values/styles.xml'];

function capacitor(t, work) {
  step(`${t.key}: capacitor project ${relative(ROOT, work)}`);
  const android = join(work, 'android');
  const config = {
    appId: t.applicationId,
    appName: t.label.en,
    webDir: 'www',
    backgroundColor: t.background,
    // Default https://localhost origin. No remote server, no cleartext, no mixed content.
    android: { allowMixedContent: false },
    plugins: {
      // Core's built-in SystemBars plugin: draw edge to edge and pass the insets to the page as
      // env(safe-area-inset-*) (WebView >= 140) — every page sets viewport-fit=cover. DARK = light
      // icons, for the dark backgrounds of the launcher and every game (seen only when an edge
      // swipe shows the bars for a moment). hidden: the plugin's start-up call hides the bars
      // instead of showing them again over MainActivity's immersive mode.
      SystemBars: { insetsHandling: 'css', style: 'DARK', initialViewportFitValueHint: 'cover', hidden: true },
    },
  };
  writeFileSync(join(work, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(work, 'package.json'), `${JSON.stringify({ name: `test-apk-${t.key}`, private: true, type: 'module' }, null, 2)}\n`);
  const pristine = join(work, 'pristine');
  const ready = existsSync(join(android, 'app', 'build.gradle')) && PRISTINE.every((f) => existsSync(join(pristine, f)));
  if (!ready) {
    rmSync(android, { recursive: true, force: true }); // half-made folder
    rmSync(pristine, { recursive: true, force: true });
    run(join(BIN, 'cap'), ['add', 'android'], { cwd: work });
    for (const f of PRISTINE) {
      mkdirSync(join(pristine, f, '..'), { recursive: true });
      copyFileSync(join(android, f), join(pristine, f));
    }
  }
  run(join(BIN, 'cap'), ['sync', 'android'], { cwd: work });
}

function patchNative(t, work, info) {
  step(`${t.key}: patch android/ (id ${t.applicationId}, labels, portrait, full screen, icon, splash, back button, updater, signing)`);
  const android = join(work, 'android');
  const main = join(android, 'app', 'src', 'main');
  const res = join(main, 'res');
  const pristine = (f) => readFileSync(join(work, 'pristine', f), 'utf8');

  // Manifest: portrait (Android 16 ignores it on large screens, sw >= 600dp); the updater's
  // install permission and FileProvider (test builds only: tools/aab.mjs never adds them).
  let xml = pristine('app/src/main/AndroidManifest.xml');
  xml = xml.includes('android:screenOrientation=')
    ? xml.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="portrait"')
    : replaceOnce(xml, /android:name="\.MainActivity"/, 'android:name=".MainActivity"\n            android:screenOrientation="portrait"', 'AndroidManifest activity');
  xml = replaceOnce(
    xml,
    /\n(\s*)<\/application>/,
    [
      '',
      '        <!-- Test builds only (tools/apk.mjs): hands the downloaded update APK to the installer. -->',
      '        <provider',
      '            android:name=".UpdateFileProvider"',
      '            android:authorities="${applicationId}.testupdate"',
      '            android:exported="false"',
      '            android:grantUriPermissions="true">',
      '            <meta-data',
      '                android:name="android.support.FILE_PROVIDER_PATHS"',
      '                android:resource="@xml/test_update_paths" />',
      '        </provider>',
      '$1</application>',
    ].join('\n'),
    'AndroidManifest </application>',
  );
  xml = replaceOnce(
    xml,
    /(<uses-permission android:name="android\.permission\.INTERNET" \/>)/,
    '$1\n    <!-- Test builds only: the in-app updater installs newer test APKs (Android asks each time). -->\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
    'AndroidManifest INTERNET permission',
  );
  writeFileSync(join(main, 'AndroidManifest.xml'), xml);

  // Themes: no action bar on the launch (splash) theme or any other, cutout drawn into.
  try {
    writeFileSync(join(res, 'values', 'styles.xml'), fullScreenStyles(pristine('app/src/main/res/values/styles.xml')));
  } catch (e) {
    fail(e.message);
  }
  mkdirSync(join(res, 'xml'), { recursive: true });
  writeFileSync(
    join(res, 'xml', 'test_update_paths.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<!-- Test builds only: the one folder UpdateFileProvider may share (the downloaded update). -->\n<paths>\n    <cache-path name="updates" path="updates/" />\n</paths>\n',
  );

  // Labels: English default, Turkish in values-tr; the toast of the per-game back button.
  const strings = (lang) => [
    `    <string name="app_name">${androidString(t.label[lang])}</string>`,
    `    <string name="title_activity_main">${androidString(t.label[lang])}</string>`,
    `    <string name="back_again_to_leave">${lang === 'tr' ? 'Çıkmak için geri tuşuna tekrar basın' : 'Press back again to leave'}</string>`,
  ];
  const kept = pristine('app/src/main/res/values/strings.xml')
    .split('\n')
    .filter((l) => !/name="(app_name|title_activity_main|back_again_to_leave)"/.test(l))
    // Capacitor's identifiers are not texts: without this, values-tr makes lint report them untranslated.
    .map((l) => (/name="(package_name|custom_url_scheme)"/.test(l) && !l.includes('translatable=') ? l.replace('<string ', '<string translatable="false" ') : l));
  kept.splice(
    kept.findIndex((l) => l.includes('</resources>')),
    0,
    ...strings('en'),
  );
  writeFileSync(join(res, 'values', 'strings.xml'), kept.join('\n'));
  mkdirSync(join(res, 'values-tr'), { recursive: true });
  writeFileSync(join(res, 'values-tr', 'strings.xml'), ['<?xml version="1.0" encoding="utf-8"?>', '<resources>', ...strings('tr'), '</resources>', ''].join('\n'));

  // versionName shows the build in Settings → Apps. versionCode = minutes since 2026-01-01 UTC,
  // the same for every app of one run: every new test APK installs over an older one as an
  // update, local and GitHub builds alike; Android's ceiling of 2.1e9 is ~4000 years away.
  // Debug signing = the committed public test key, so this machine and GitHub sign identically.
  let gradle = pristine('app/build.gradle');
  gradle = replaceOnce(gradle, /versionName "[^"]*"/, `versionName "${info.versionName}"`, 'app/build.gradle versionName');
  gradle = replaceOnce(gradle, /versionCode \d+/, `versionCode ${info.versionCode}`, 'app/build.gradle versionCode');
  gradle = replaceOnce(
    gradle,
    /\n {4}buildTypes \{\n/,
    [
      '',
      '    signingConfigs {',
      '        // tools/apk.mjs: the PUBLIC test-only key (tools/test-imza/README.md). Never for Play.',
      '        debug {',
      `            storeFile file(${JSON.stringify(TEST_KEY.file)})`,
      `            storePassword "${TEST_KEY.password}"`,
      `            keyAlias "${TEST_KEY.alias}"`,
      `            keyPassword "${TEST_KEY.password}"`,
      '        }',
      '    }',
      '    buildTypes {',
      '',
    ].join('\n'),
    'app/build.gradle buildTypes',
  );
  writeFileSync(join(android, 'app', 'build.gradle'), gradle);

  // Java: MainActivity (back button, full screen, plugin registration) + the updater plugin.
  const pkgDir = join(main, 'java', ...t.applicationId.split('.'));
  if (!existsSync(join(pkgDir, 'MainActivity.java'))) fail(`MainActivity not found in ${relative(ROOT, pkgDir)} (did cap add use appId ${t.applicationId}?)`);
  const fill = {
    __PACKAGE__: t.applicationId,
    __HAS_LAUNCHER__: String(t.launcher),
    __RELEASE_BASE__: info.releaseBase,
  };
  for (const name of ['MainActivity.java', 'TestUpdatePlugin.java', 'UpdateFileProvider.java']) {
    let src = readFileSync(join(APP, 'native', name), 'utf8');
    for (const [k, v] of Object.entries(fill)) src = src.replaceAll(k, v);
    if (/__[A-Z_]+__/.test(src)) fail(`native/${name}: unfilled placeholder ${/__[A-Z_]+__/.exec(src)[0]}`);
    writeFileSync(join(pkgDir, name), src);
  }

  // Icon: the bundle's code-drawn three dots; a game's own Play icon (store/<slug>/icon/, read
  // only, same code as tools/aab.mjs) — the " (Test)" label tells the two apart.
  if (t.launcher) {
    writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ICON_BG}</color>\n</resources>\n`);
    mkdirSync(join(res, 'drawable-v24'), { recursive: true });
    writeFileSync(join(res, 'drawable-v24', 'ic_launcher_foreground.xml'), foregroundVector());
    for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) writeFileSync(join(res, 'mipmap-anydpi-v26', name), adaptiveIconXml());
    for (const [density, size] of Object.entries(LEGACY_SIZES)) {
      const dir = join(res, `mipmap-${density}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'ic_launcher.png'), legacyIconPng(size, false));
      writeFileSync(join(dir, 'ic_launcher_round.png'), legacyIconPng(size, true));
      rmSync(join(dir, 'ic_launcher_foreground.png'), { force: true });
    }
  } else {
    try {
      console.log(`icon: ${writeIcon(res, findIconSource(join(ROOT, 'store', t.games[0], 'icon')), t.icon).replace('<slug>', t.games[0])}`);
    } catch (e) {
      fail(`launcher icon: ${e.message}`);
    }
  }

  // Splash: plain background colour instead of Capacitor's logo images.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) rmSync(join(res, dir, 'splash.png'), { force: true });
  writeFileSync(
    join(res, 'drawable', 'splash.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n    <solid android:color="${t.background}"/>\n</shape>\n`,
  );
}

function gradle(t, work, sdk) {
  step(`${t.key}: gradle assembleDebug`);
  const android = join(work, 'android');
  writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk}\n`);
  const own = process.env.OYUN_GRADLE;
  const gradlew = join(android, 'gradlew');
  if (!own) run('chmod', ['+x', gradlew]);
  // --no-daemon: nothing keeps running after the build.
  run(own || gradlew, ['assembleDebug', '--no-daemon', '--console=plain', '--warning-mode=summary'], { cwd: android });
}

// ---------------------------------------------------------------- checks + delivery
function verify(t, work, tools, info) {
  step(`${t.key}: verify APK`);
  const apk = join(work, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!existsSync(apk)) fail(`Gradle finished but ${relative(ROOT, apk)} does not exist`);
  const problems = [];
  const badging = run(join(tools, 'aapt'), ['dump', 'badging', apk], { capture: true });
  const pkg = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m.exec(badging);
  const label = (suffix) => new RegExp(`^application-label${suffix}:'([^']*)'`, 'm').exec(badging)?.[1];
  const facts = {
    applicationId: pkg?.[1],
    versionCode: Number(pkg?.[2]),
    versionName: pkg?.[3],
    label: { en: label(''), tr: label('-tr') },
    minSdk: Number(/^(?:sdkVersion|minSdkVersion):'(\d+)'/m.exec(badging)?.[1]),
    targetSdk: Number(/^targetSdkVersion:'(\d+)'/m.exec(badging)?.[1]),
    permissions: [...badging.matchAll(/^uses-permission: name='([^']+)'/gm)].map((m) => m[1]),
  };
  if (facts.applicationId !== t.applicationId) problems.push(`package ${facts.applicationId} != ${t.applicationId}`);
  if (facts.versionCode !== info.versionCode) problems.push(`versionCode ${facts.versionCode} != ${info.versionCode}`);
  if (facts.label.en !== t.label.en || facts.label.tr !== t.label.tr) problems.push(`labels ${JSON.stringify(facts.label)} != ${JSON.stringify(t.label)}`);
  if (facts.minSdk !== 24 || facts.targetSdk < 35) problems.push(`minSdk ${facts.minSdk} / targetSdk ${facts.targetSdk} (expected 24 / >= 35)`);
  if (!facts.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES')) problems.push('REQUEST_INSTALL_PACKAGES missing');
  const okPerm = new Set(['android.permission.INTERNET', 'android.permission.REQUEST_INSTALL_PACKAGES', `${t.applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`]);
  for (const p of facts.permissions.filter((p) => !okPerm.has(p))) problems.push(`unexpected permission ${p}`);

  const tree = run(join(tools, 'aapt'), ['dump', 'xmltree', apk, 'AndroidManifest.xml'], { capture: true });
  const provider = `${t.applicationId}.testupdate`;
  if (!tree.includes(`"${provider}"`) || !tree.includes(`"${t.applicationId}.UpdateFileProvider"`)) problems.push(`provider ${provider} (UpdateFileProvider) not in the manifest`);

  // Full screen: the activity's theme (the manifest's launch theme) and the theme BridgeActivity
  // switches to have no action bar or title (tools/aab/theme.mjs).
  const activityTheme = /E: activity[\s\S]*?android:theme\(0x01010000\)=@(0x[0-9a-f]+)/.exec(tree)?.[1];
  const resources = run(join(tools, 'aapt2'), ['dump', 'resources', apk], { capture: true });
  const launchId = /resource (0x[0-9a-f]+) style\/AppTheme\.NoActionBarLaunch\n/.exec(resources)?.[1];
  if (!activityTheme || activityTheme !== launchId) problems.push(`activity theme ${activityTheme ?? 'missing'} is not style/AppTheme.NoActionBarLaunch (${launchId ?? 'missing'})`);
  const themes = checkThemeDump(resources, ['AppTheme', 'AppTheme.NoActionBar', 'AppTheme.NoActionBarLaunch']);
  problems.push(...themes.problems);

  const entries = run('unzip', ['-Z1', apk], { capture: true }).split('\n').filter(Boolean);
  for (const dir of pages(t)) {
    for (const f of ['index.html', UPDATER]) if (!entries.includes(`assets/public/${dir ? `${dir}/` : ''}${f}`)) problems.push(`assets/public/${dir ? `${dir}/` : ''}${f} missing`);
  }
  const dex = entries.filter((e) => /^classes\d*\.dex$/.test(e));
  const dexText = dex.map((e) => execFileSync('unzip', ['-p', apk, e], { maxBuffer: 256 * 1024 * 1024 }).toString('latin1')).join('');
  const releaseInDex = dexText.includes(info.releaseBase);
  for (const cls of ['TestUpdatePlugin', 'UpdateFileProvider']) if (!dexText.includes(`L${t.applicationId.replaceAll('.', '/')}/${cls};`)) problems.push(`${cls} not in the dex`);
  if (!releaseInDex) problems.push(`release URL ${info.releaseBase} not in the dex`);

  const certs = run(join(tools, 'apksigner'), ['verify', '--print-certs', '-v', apk], { capture: true });
  const certSha = /certificate SHA-256 digest: ([0-9a-f]+)/.exec(certs)?.[1];
  const expected = TEST_KEY.sha256.replaceAll(':', '').toLowerCase();
  if (!/^Verifies$/m.test(certs)) problems.push('apksigner: does not verify');
  if (certSha !== expected) problems.push(`signed with ${certSha}, not the test key ${expected}`);
  const schemes = [...certs.matchAll(/Verified using (v\S+) scheme[^:]*: true/g)].map((m) => m[1]);

  if (problems.length) fail(`APK check (${t.key}):\n  ${problems.join('\n  ')}`);
  console.log(`manifest: ${JSON.stringify(facts)}`);
  console.log(`themes: activity = AppTheme.NoActionBarLaunch; ${themes.summary.join('; ')}`);
  console.log(`provider: ${provider} → UpdateFileProvider; dex: TestUpdatePlugin, UpdateFileProvider, ${info.releaseBase}`);
  console.log(`contents: ${entries.filter((e) => e.startsWith('assets/public/') && !e.endsWith('/')).length} web files; updater on ${pages(t).map((d) => `/${d}`).join(', ')}`);
  console.log(`signature: verifies (${schemes.join(', ')}), certificate SHA-256 ${certSha} = test key`);
  return { apk, facts };
}

function deliver(t, apk, info) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) if (f.startsWith(`${t.fileBase}-`) && f.endsWith('.apk')) rmSync(join(OUT_DIR, f));
  const file = `${t.fileBase}-${info.versionCode}.apk`;
  const out = join(OUT_DIR, file);
  copyFileSync(apk, out);
  const entry = {
    applicationId: t.applicationId,
    versionCode: info.versionCode,
    versionName: info.versionName,
    file,
    size: statSync(out).size,
    sha256: sha256File(out),
    builtAt: info.builtAt,
    notes: info.notes,
    label: t.label,
  };
  console.log(`APK: ${out} (${(entry.size / 1024 / 1024).toFixed(2)} MB, sha256 ${entry.sha256})`);
  return entry;
}

// ---------------------------------------------------------------- main
const targets = pickTargets(process.argv[2]);
const { sdk, tools } = preflight(targets);
const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown';
const dirty = git(['status', '--porcelain']) !== '';
const now = new Date();
const info = {
  date: now.toISOString().slice(0, 10),
  commit: dirty ? `${commit}-dirty` : commit,
  versionCode: Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000),
  builtAt: now.toISOString(),
  // The "what changed" line in the update banner.
  notes: `${git(['log', '-1', '--format=%s']) || 'local build'}${dirty ? ' (+ local changes)' : ''}`,
  releaseBase: releaseBase(repository()),
};
info.versionName = `test-${info.date}-${info.commit}`;
console.log(`build ${info.date} ${info.commit}, versionCode ${info.versionCode}, apps: ${targets.map((t) => t.key).join(', ')}`);
console.log(`updates from ${info.releaseBase}${MANIFEST_FILE}`);
const updater = buildUpdater();
const built = [];
for (const t of targets) {
  const work = join(WORK, t.key);
  const www = join(work, 'www');
  mkdirSync(work, { recursive: true });
  buildWeb(t, www, info);
  addUpdater(t, www, updater);
  checkWeb(t, www);
  capacitor(t, work);
  patchNative(t, work, info);
  gradle(t, work, sdk);
  const { apk } = verify(t, work, tools, info);
  built.push(deliver(t, apk, info));
}
const manifest = buildManifest({ apps: built, commit: info.commit, generatedAt: info.builtAt });
writeFileSync(join(OUT_DIR, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
step('done');
for (const a of built) console.log(`  ${a.file.padEnd(36)} ${a.applicationId.padEnd(38)} "${a.label.en}" / "${a.label.tr}"`);
console.log(`manifest: ${join(OUT_DIR, MANIFEST_FILE)}`);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

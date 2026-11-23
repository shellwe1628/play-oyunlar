#!/usr/bin/env node
// Release Android App Bundle for ONE game, as its own Google Play app.
//   npm run aab -- <slug>                     → build/<slug>-release.aab (+ build/<slug>-release.json)
//
// Per-app settings come from store/apps.json (application id, names per language, version name,
// platform adapter, colours); nothing in games/<slug>/ is edited. Each run builds from scratch in
// build/aab/<slug>/ (git-ignored): web bundle → offline/URL check → fresh Capacitor Android
// project → patches (id, names, portrait, full screen, back button, icon, splash, no cleartext,
// no cloud backup, signing) → `gradlew bundleRelease` → checks on the merged manifest, the
// bundle's contents and its signature.
//
// Signing: ONLY from the environment (never written to a file, never printed):
//   OYUN_UPLOAD_KEYSTORE           path to the upload keystore (.jks / .p12)
//   OYUN_UPLOAD_KEYSTORE_PASSWORD  keystore password
//   OYUN_UPLOAD_KEY_ALIAS          key alias inside the keystore
//   OYUN_UPLOAD_KEY_PASSWORD       key password (optional: defaults to the keystore password,
//                                  which is what keytool's default PKCS12 keystores use)
// Optional: OYUN_VERSION_CODE=<n> overrides the versionCode (must be higher than any uploaded);
//           OYUN_GRADLE=<gradle binary> uses that instead of the generated ./gradlew.
// Needs: Node >= 22.12, JDK 21 (java, keytool, jarsigner, jar), Android SDK (ANDROID_HOME or
// ANDROID_SDK_ROOT) with platforms;android-36 and build-tools. Guide: docs/production/play-yayin.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { findIconSource, writeIcon } from './aab/icon.mjs';
import { checkMergedPlayGames, patchPlayGamesManifest } from './aab/playgames.mjs';
import { checkThemeDump, fullScreenStyles } from './aab/theme.mjs';
import { ADMOB_PLUGIN, admobIds, admobPluginVersion, admobViteEnv, checkBundleAdIds, usesPlatformAdapter } from './admob.mjs';
import { checkStoreMarkers, STORE_VITE_ENV } from './store-check.mjs';
import { ROOT } from './template.mjs';

const BIN = join(ROOT, 'node_modules', '.bin');
const WIN = process.platform === 'win32';
/** node_modules/.bin tool (a .cmd shim on Windows) */
const bin = (name) => join(BIN, WIN ? `${name}.cmd` : name);
const OUT_DIR = join(ROOT, 'build');
/** Lowest targetSdk this script accepts. Play's yearly target-API rule: check the Console. */
const MIN_TARGET_SDK = 35;
/** Same allow-list as tools/apk.mjs: XML namespaces and Phaser's (disabled) banner link. */
// + the games' own privacy policy pages, linked from the online panel (App Store 5.1.1)
const ALLOWED_URLS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'https://phaser.io', 'https://phaser.io/', ...['fosil', 'kivilcim', 'okcu'].map((s) => `https://oyunlar.carsihani.me/gizlilik/${s}/`)]);
/** com.google.android.gms:play-services-games-v2, pinned (apps with a playGames block only). */
const PLAY_GAMES_V2 = '21.0.0';
const SIGNING_ENV =['OYUN_UPLOAD_KEYSTORE', 'OYUN_UPLOAD_KEYSTORE_PASSWORD', 'OYUN_UPLOAD_KEY_ALIAS'];

const t0 = Date.now();
const step = (msg) => console.log(`\n=== ${msg}`);

function fail(msg) {
  console.error(`\naab: FAILED\n${msg}\n`);
  process.exit(1);
}

/** Runs a command; arguments are printed, the environment never is. */
function run(cmd, args, opts = {}) {
  console.log(`$ ${relative(ROOT, opts.cwd ?? ROOT) || '.'}: ${relative(BIN, cmd).startsWith('..') ? cmd : relative(BIN, cmd)} ${args.join(' ')}`);
  // Windows .cmd/.bat shims need a shell; quote every part (the repo path may hold spaces).
  const shell = WIN && /\.(cmd|bat)$/i.test(cmd);
  const q = (s) => (/[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const r = spawnSync(shell ? [cmd, ...args].map(q).join(' ') : cmd, shell ? [] : args, {
    shell,
    cwd: opts.cwd ?? ROOT,
    stdio: ['ignore', opts.capture ? 'pipe' : 'inherit', opts.capture ? 'pipe' : 'inherit'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
  });
  if (r.error) fail(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${r.status} (cwd ${relative(ROOT, opts.cwd ?? ROOT) || '.'})${opts.capture ? `\n${r.stdout}${r.stderr}` : ''}`);
  // CRLF -> LF: Windows tools (aapt2, jar) end lines with CR LF; every parser below expects LF
  return opts.capture ? `${r.stdout}${r.stderr}`.replace(/\r\n/g, '\n') : '';
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

function edit(file, fn) {
  if (!existsSync(file)) fail(`expected generated file is missing: ${relative(ROOT, file)}`);
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(file, after);
}

/** Replace exactly one match of `re`, or fail with a readable message (template drift). */
function replaceOnce(text, re, replacement, what) {
  const matches = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  if (!matches || matches.length !== 1) fail(`cannot patch ${what}: expected one match of ${re}, found ${matches?.length ?? 0}`);
  return text.replace(re, replacement);
}

/** Android string resource text: XML-escaped, apostrophes and quotes backslash-escaped. */
const androidString = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

// ---------------------------------------------------------------- settings
function loadApp(slug) {
  const file = join(ROOT, 'store', 'apps.json');
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  const app = cfg.apps.find((a) => a.slug === slug);
  const slugs = cfg.apps.map((a) => a.slug).join(', ');
  if (!slug) fail(`usage: npm run aab -- <slug>   (one of: ${slugs})`);
  if (!app) fail(`store/apps.json has no app "${slug}" (has: ${slugs})`);
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(app.applicationId)) fail(`${slug}: applicationId "${app.applicationId}" is not a valid Android package name`);
  for (const lang of cfg.languages) if (!app.title?.[lang]) fail(`${slug}: store/apps.json has no title for ${lang}`);
  if (!['web', 'capacitor'].includes(app.platform)) fail(`${slug}: platform must be "web" or "capacitor", not "${app.platform}"`);
  if (!/^\d+\.\d+\.\d+$/.test(app.versionName)) fail(`${slug}: versionName must look like 1.2.3, not "${app.versionName}"`);
  // `source`: the Vite app the Play build ships, when it is not games/<slug> (okcu ships its 3D
  // renderer, apps/okcu-3d, which runs the same simulation). Template-made games carry
  // oyun.config.json; apps/okcu-3d declares the platform adapter in its package.json (tools/admob.mjs
  // usesPlatformAdapter). A source without oyun.config.json is portrait-only by design.
  const source = app.source ?? join('games', slug);
  if (!existsSync(join(ROOT, source, 'index.html'))) fail(`${slug}: ${source} is missing`);
  const configFile = join(ROOT, source, 'oyun.config.json');
  const adapter = usesPlatformAdapter(join(ROOT, source));
  if (existsSync(configFile)) {
    const meta = JSON.parse(readFileSync(configFile, 'utf8'));
    if (meta.orientation !== 'portrait') fail(`${slug}: oyun.config.json orientation is ${meta.orientation}; this script locks portrait`);
  }
  // AdMob rewarded ads (tools/admob.mjs): template games built with the capacitor adapter only
  if (app.platform === 'capacitor' && !adapter) fail(`${slug}: platform "capacitor" needs the platform adapter, which ${source} does not use`);
  let ads = null;
  if (app.platform === 'capacitor') {
    try {
      ads = { ...admobIds(app, 'android'), plugin: admobPluginVersion(), test: process.env.OYUN_ADMOB_TEST === '1' };
    } catch (e) {
      fail(e.message);
    }
  }
  return { ...app, source, adapter, ads, defaultLanguage: cfg.defaultLanguage, languages: cfg.languages };
}

// ---------------------------------------------------------------- preflight
function preflight() {
  step('preflight');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) fail(`Node >= 22.12 needed, found ${process.versions.node}`);

  const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (java.error) fail('java not found on PATH: install JDK 21 (Capacitor 8 / AGP 8.13 need it).');
  const jv = /version "(\d+)/.exec(`${java.stderr}${java.stdout}`);
  if (!jv || Number(jv[1]) < 21) fail(`JDK 21 needed, java -version says: ${(java.stderr || java.stdout).split('\n')[0]}`);
  for (const tool of ['keytool', 'jarsigner', 'jar']) if (spawnSync(tool, ['-help'], { encoding: 'utf8' }).error) fail(`${tool} not found on PATH (it ships with the JDK)`);

  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk || !existsSync(sdk)) fail(`Android SDK not found: ANDROID_HOME/ANDROID_SDK_ROOT is ${sdk ? `${sdk}, which does not exist` : 'not set'}.\nSee apps/test-paketi/README.md ("Android SDK kurulumu").`);
  const platforms = existsSync(join(sdk, 'platforms')) ? readdirSync(join(sdk, 'platforms')) : [];
  if (!platforms.includes('android-36')) console.warn(`warning: ${sdk} has no platforms/android-36 (found: ${platforms.join(', ') || 'none'}); Gradle will try to install it`);

  // Signing: names only, values never printed.
  const missing = SIGNING_ENV.filter((n) => !process.env[n]);
  if (missing.length) fail(`signing is configured only through environment variables; missing: ${missing.join(', ')}\n(OYUN_UPLOAD_KEY_PASSWORD is optional and defaults to the keystore password.)`);
  const ks = resolve(process.env.OYUN_UPLOAD_KEYSTORE);
  if (!existsSync(ks)) fail(`OYUN_UPLOAD_KEYSTORE points to a file that does not exist`);
  if (!relative(ROOT, ks).startsWith('..') && !isAbsolute(relative(ROOT, ks))) fail('the upload keystore must live outside the repository (OYUN_UPLOAD_KEYSTORE is inside it)');
  const env = {
    OYUN_UPLOAD_KEYSTORE: ks,
    OYUN_UPLOAD_KEY_PASSWORD: process.env.OYUN_UPLOAD_KEY_PASSWORD || process.env.OYUN_UPLOAD_KEYSTORE_PASSWORD,
  };
  // keytool reads the password from the environment variable by name (:env), not from argv.
  const list = spawnSync('keytool', ['-list', '-v', '-keystore', ks, '-storepass:env', 'OYUN_UPLOAD_KEYSTORE_PASSWORD', '-alias', process.env.OYUN_UPLOAD_KEY_ALIAS], { encoding: 'utf8' });
  if (list.status !== 0) fail('keytool cannot open the upload keystore with OYUN_UPLOAD_KEYSTORE_PASSWORD and OYUN_UPLOAD_KEY_ALIAS (wrong password, wrong alias or not a keystore)');
  const sha = /SHA256:\s*([0-9A-F:]+)/.exec(list.stdout)?.[1] ?? '?';
  // The public test-only key (tools/test-imza/, used by tools/apk.mjs) must never sign a Play
  // build, not even a copy of it placed outside the repository.
  if (sha === 'BD:03:C5:F1:66:FD:A1:A6:BD:14:71:C1:A7:87:BF:A8:43:80:E7:11:E3:2E:EE:60:92:05:F0:3A:E0:FB:8C:64') fail('the upload keystore is the PUBLIC test key from tools/test-imza/ (see its README): never use it for Google Play');
  console.log(`node ${process.versions.node}, java ${jv[1]}, SDK ${sdk}`);
  console.log(`upload key: alias ok, certificate SHA-256 ${sha}`);
  return { sdk, signEnv: env, uploadCertSha256: sha };
}

// ---------------------------------------------------------------- web
function buildWeb(app, work) {
  step(`web bundle from ${app.source}${app.adapter ? ` (VITE_OYUN_PLATFORM=${app.platform})` : ''}`);
  run(bin('vite'), ['build', '--base', './', '--outDir', join(work, 'www'), '--emptyOutDir'], {
    cwd: join(ROOT, app.source),
    // VITE_OYUN_STORE=1: no test hook, no URL switches, no web-portal adapter (tools/store-check.mjs)
    env: { VITE_OYUN_PLATFORM: app.platform, ...admobViteEnv(app.ads), ...STORE_VITE_ENV },
  });
}

/** Every path relative, nothing fetched from the network, the chosen adapter baked in. */
function checkWeb(app, www) {
  step('check web bundle');
  const problems = [];
  const files = filesUnder(www);
  const html = join(www, 'index.html');
  if (!existsSync(html)) problems.push('missing index.html');
  else {
    const text = readFileSync(html, 'utf8');
    if (!text.includes('viewport-fit=cover')) problems.push('index.html: no viewport-fit=cover');
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
      const url = m[1];
      if (url.startsWith('data:')) continue;
      if (!url.startsWith('./')) problems.push(`index.html: non-relative URL ${url}`);
      else if (!existsSync(join(www, url))) problems.push(`index.html: ${url} does not exist`);
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
      for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+/g)) {
        const url = m[0].replace(/[),;'"]+$/, '');
        if (!ALLOWED_URLS.has(url)) problems.push(`${rel}: external URL ${url}`);
      }
    }
  }
  const js = files.filter((f) => f.endsWith('.js'));
  const forced = new RegExp(`forced:\\s*["'\`]${app.platform}["'\`]`);
  if (app.adapter && !js.some((f) => forced.test(readFileSync(f, 'utf8')))) problems.push(`platform choice "${app.platform}" not found in the bundle`);
  problems.push(...checkBundleAdIds(js.map((f) => readFileSync(f, 'utf8')), app.ads));
  problems.push(...checkStoreMarkers(js.map((f) => ({ name: relative(www, f), text: readFileSync(f, 'utf8') }))));
  if (problems.length) fail(`web bundle check:\n  ${problems.join('\n  ')}`);
  const kb = Math.round(files.reduce((s, f) => s + statSync(f).size, 0) / 1024);
  console.log(`ok: ${files.length} files, ${kb} KB; relative paths, no external URLs, no test hook or URL switches, ${app.adapter ? `${app.platform} adapter` : 'no platform adapter (no ads)'}${app.ads ? `, AdMob rewarded ${app.ads.rewarded}${app.ads.test ? ' (TEST ads)' : ''}` : ', no ad ids'}`);
}

// ---------------------------------------------------------------- native
function capacitor(app, work) {
  step('capacitor project (fresh)');
  const config = {
    appId: app.applicationId,
    appName: app.title[app.defaultLanguage],
    webDir: 'www',
    backgroundColor: app.background,
    android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
    plugins: {
      // Core's built-in SystemBars plugin: edge to edge, insets passed to the page as
      // env(safe-area-inset-*) (index.html has viewport-fit=cover). DARK = light bar icons (seen
      // only when an edge swipe shows the bars for a moment). hidden: the plugin's start-up call
      // hides the bars instead of showing them again over MainActivity's immersive mode.
      SystemBars: { insetsHandling: 'css', style: 'DARK', initialViewportFitValueHint: 'cover', hidden: true },
    },
  };
  writeFileSync(join(work, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  // Capacitor finds plugins through this package.json's dependencies and resolves them like
  // Node, upwards from build/aab/<slug>/: the root node_modules install is used, nothing is
  // installed here.
  const pkg = { name: `aab-${app.slug}`, private: true, type: 'module', ...(app.ads ? { dependencies: { [ADMOB_PLUGIN]: app.ads.plugin } } : {}) };
  writeFileSync(join(work, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  rmSync(join(work, 'android'), { recursive: true, force: true });
  run(bin('cap'), ['add', 'android'], { cwd: work });
  const settings = join(work, 'android', 'capacitor.settings.gradle');
  const linked = existsSync(settings) && readFileSync(settings, 'utf8').includes("':capacitor-community-admob'");
  if (Boolean(app.ads) !== linked) fail(app.ads ? `cap add did not link ${ADMOB_PLUGIN} (android/capacitor.settings.gradle)` : `${ADMOB_PLUGIN} linked into an app without ads`);
}

function patchNative(app, work, info) {
  step('patch android/ (id, names, portrait, full screen, back button, icon, splash, cleartext, backup, signing)');
  const android = join(work, 'android');
  const main = join(android, 'app', 'src', 'main');
  const res = join(main, 'res');

  edit(join(main, 'AndroidManifest.xml'), (xml) => {
    let x = xml.includes('android:screenOrientation=')
      ? xml.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="portrait"')
      : replaceOnce(xml, /android:name="\.MainActivity"/, 'android:name=".MainActivity"\n            android:screenOrientation="portrait"', 'AndroidManifest activity');
    // Saves live only on the device: no Android cloud backup and (Android 12+) no
    // device-to-device transfer of the WebView's localStorage. The privacy policy
    // (docs/gizlilik/) and the Data safety answers rely on this.
    x = replaceOnce(
      x,
      /android:allowBackup="true"/,
      'android:allowBackup="false"\n        android:dataExtractionRules="@xml/data_extraction_rules"\n        android:usesCleartextTraffic="false"',
      'AndroidManifest allowBackup',
    );
    // screenOrientation="portrait" implies a required android.hardware.screen.portrait,
    // which Play flags as excluding tablets, ChromeOS, Play Games on PC and XR. The game
    // still runs portrait there; declare the feature optional.
    if (!x.includes('android.hardware.screen.portrait')) {
      x = replaceOnce(
        x,
        /<application\b/,
        '<uses-feature android:name="android.hardware.screen.portrait" android:required="false" />\n\n    <application',
        'AndroidManifest application',
      );
    }
    return x;
  });
  // Themes: no action bar on the launch (splash) theme or any other, cutout drawn into.
  try {
    edit(join(res, 'values', 'styles.xml'), fullScreenStyles);
  } catch (e) {
    fail(e.message);
  }

  const exclude = ['root', 'file', 'database', 'sharedpref', 'external'].map((d) => `        <exclude domain="${d}" path="."/>`);
  mkdirSync(join(res, 'xml'), { recursive: true });
  writeFileSync(
    join(res, 'xml', 'data_extraction_rules.xml'),
    ['<?xml version="1.0" encoding="utf-8"?>', '<data-extraction-rules>', '    <cloud-backup>', ...exclude, '    </cloud-backup>', '    <device-transfer>', ...exclude, '    </device-transfer>', '</data-extraction-rules>', ''].join('\n'),
  );

  const strings = (lang) => [
    `    <string name="app_name">${androidString(app.title[lang])}</string>`,
    `    <string name="title_activity_main">${androidString(app.title[lang])}</string>`,
    `    <string name="back_again_to_leave">${lang.startsWith('tr') ? 'Çıkmak için geri tuşuna tekrar basın' : 'Press back again to leave'}</string>`,
  ];
  edit(join(res, 'values', 'strings.xml'), (xml) => {
    const kept = xml.split('\n').filter((l) => !/name="(app_name|title_activity_main|back_again_to_leave)"/.test(l));
    const end = kept.findIndex((l) => l.includes('</resources>'));
    kept.splice(end, 0, ...strings(app.defaultLanguage));
    return kept.join('\n');
  });
  for (const lang of app.languages.filter((l) => l !== app.defaultLanguage)) {
    const dir = join(res, `values-${lang.split('-')[0]}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'strings.xml'), ['<?xml version="1.0" encoding="utf-8"?>', '<resources>', ...strings(lang), '</resources>', ''].join('\n'));
  }

  edit(join(android, 'app', 'build.gradle'), (g) => {
    let x = replaceOnce(g, /versionName "[^"]*"/, `versionName "${info.versionName}"`, 'app/build.gradle versionName');
    x = replaceOnce(x, /versionCode \d+/, `versionCode ${info.versionCode}`, 'app/build.gradle versionCode');
    // Signing values are read from the environment when Gradle runs; none is written here.
    x = replaceOnce(
      x,
      /\n {4}buildTypes \{\n {8}release \{\n/,
      [
        '',
        '    signingConfigs {',
        '        upload {',
        '            // tools/aab.mjs: path and passwords come only from the environment.',
        '            storeFile file(System.getenv("OYUN_UPLOAD_KEYSTORE"))',
        '            storePassword System.getenv("OYUN_UPLOAD_KEYSTORE_PASSWORD")',
        '            keyAlias System.getenv("OYUN_UPLOAD_KEY_ALIAS")',
        '            keyPassword System.getenv("OYUN_UPLOAD_KEY_PASSWORD")',
        '        }',
        '    }',
        '    buildTypes {',
        '        release {',
        '            signingConfig signingConfigs.upload',
        '            debuggable false',
        '',
      ].join('\n'),
      'app/build.gradle buildTypes.release',
    );
    return x;
  });

  // MainActivity: back button (press twice → background) + full screen (immersive, cutout).
  const activity = join(main, 'java', ...app.applicationId.split('.'), 'MainActivity.java');
  if (!existsSync(activity)) fail(`MainActivity not found at ${relative(ROOT, activity)} (did cap add use appId ${app.applicationId}?)`);
  const pgs = playGamesConfig(app);
  writeFileSync(
    activity,
    readFileSync(join(ROOT, 'tools', 'aab', 'MainActivity.java'), 'utf8')
      .replace('__PACKAGE__', app.applicationId)
      .replace('/*__PLUGINS__*/', pgs ? 'registerPlugin(PlayGamesPlugin.class);' : ''),
  );
  if (pgs) patchPlayGames(app, pgs, main, android);
  if (app.ads) patchAdMob(app, main);

  let iconNote;
  try {
    iconNote = writeIcon(res, findIconSource(join(ROOT, 'store', app.slug, 'icon')), app.icon).replace('<slug>', app.slug);
  } catch (e) {
    fail(`launcher icon: ${e.message}`);
  }
  console.log(`icon: ${iconNote}`);

  // Splash: plain background colour instead of Capacitor's logo images.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) rmSync(join(res, dir, 'splash.png'), { force: true });
  writeFileSync(
    join(res, 'drawable', 'splash.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n    <solid android:color="${app.background}"/>\n</shape>\n`,
  );
  return iconNote;
}

/**
 * store/apps.json `playGames`: { "appId": "<Console's Play Games project id, digits>",
 * "boards": { "<logical id>": "<Console leaderboard id>" } }. Absent = no Play Games in the app.
 */
function playGamesConfig(app) {
  const p = app.playGames;
  if (!p) return null;
  if (!/^\d{6,}$/.test(String(p.appId ?? ''))) fail(`${app.slug}: playGames.appId must be the numeric Play Games project id`);
  const boards = Object.entries(p.boards ?? {});
  if (!boards.length) fail(`${app.slug}: playGames.boards is empty`);
  for (const [id, cid] of boards) {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) fail(`${app.slug}: playGames board id "${id}" must be lower_snake_case`);
    if (!/^[A-Za-z0-9_-]{6,}$/.test(String(cid))) fail(`${app.slug}: playGames.boards.${id} is not a leaderboard id`);
  }
  return { appId: String(p.appId), boards };
}

/** Play Games Services v2: dependency, APP_ID meta-data, ids as string resources, the plugin. */
function patchPlayGames(app, pgs, main, android) {
  writeFileSync(
    join(main, 'res', 'values', 'pgs.xml'),
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!-- tools/aab.mjs from store/apps.json playGames; ids are not translatable -->',
      '<resources>',
      `    <string name="pgs_app_id" translatable="false">${pgs.appId}</string>`,
      ...pgs.boards.map(([id, cid]) => `    <string name="pgs_board_${id}" translatable="false">${cid}</string>`),
      '</resources>',
      '',
    ].join('\n'),
  );
  // APP_ID meta-data, and the library's PlayGamesInitProvider removed: it would start Play Games at
  // app launch, before the age question (tools/aab/playgames.mjs)
  edit(join(main, 'AndroidManifest.xml'), (xml) => {
    try {
      return patchPlayGamesManifest(xml);
    } catch (e) {
      return fail(e.message);
    }
  });
  edit(join(android, 'app', 'build.gradle'), (g) =>
    replaceOnce(g, /\ndependencies \{\n/, `\ndependencies {\n    implementation "com.google.android.gms:play-services-games-v2:${PLAY_GAMES_V2}"\n`, 'app/build.gradle dependencies'),
  );
  const dir = join(main, 'java', ...app.applicationId.split('.'));
  writeFileSync(join(dir, 'PlayGamesPlugin.java'), readFileSync(join(ROOT, 'tools', 'aab', 'PlayGamesPlugin.java'), 'utf8').replace('__PACKAGE__', app.applicationId));
  console.log(`play games: project ${pgs.appId}, boards ${pgs.boards.map(([id]) => id).join(', ')}, play-services-games-v2 ${PLAY_GAMES_V2}, PlayGamesInitProvider removed (starts only after an adult age answer)`);
}

/**
 * AdMob (tools/admob.mjs): the SDK's APPLICATION_ID meta-data (the SDK refuses to start without
 * it) and, because every user is treated as a child (Families), no advertising id: the AD_ID
 * permission the SDK merges in is removed, and so are the Privacy Sandbox ad id, topics and
 * attribution permissions (identifiers / targeting a child-directed app does not use).
 */
const ADMOB_REMOVED_PERMISSIONS = [
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
];
function patchAdMob(app, main) {
  edit(join(main, 'AndroidManifest.xml'), (xml) => {
    let x = xml.includes('xmlns:tools=') ? xml : replaceOnce(xml, /<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"', 'AndroidManifest <manifest>');
    x = replaceOnce(
      x,
      /\n(\s*)<application\b/,
      `\n$1<!-- tools/aab.mjs: child-directed app, no advertising id -->\n${ADMOB_REMOVED_PERMISSIONS.map((p) => `$1<uses-permission android:name="${p}" tools:node="remove" />`).join('\n')}\n\n$1<application`,
      'AndroidManifest <application>',
    );
    return replaceOnce(
      x,
      /<\/application>/,
      `    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${app.ads.appId}" />\n    </application>`,
      'AndroidManifest </application>',
    );
  });
  console.log(`admob: app ${app.ads.appId}, rewarded ${app.ads.rewarded}${app.ads.test ? ' (TEST ads)' : ''}, plugin ${ADMOB_PLUGIN}@${app.ads.plugin}; removed ${ADMOB_REMOVED_PERMISSIONS.join(', ')}`);
}

function gradle(work, sdk, signEnv) {
  step('gradle bundleRelease');
  const android = join(work, 'android');
  // local.properties is a Java properties file: escape backslashes and the drive colon (Windows).
  writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
  const own = process.env.OYUN_GRADLE;
  const gradlew = join(android, WIN ? 'gradlew.bat' : 'gradlew');
  if (!own && !WIN) run('chmod', ['+x', gradlew]);
  // --no-daemon: nothing keeps running after the build.
  run(own || gradlew, ['bundleRelease', '--no-daemon', '--console=plain', '--warning-mode=summary'], { cwd: android, env: signEnv });
}

// ---------------------------------------------------------------- checks + delivery
/** Smallest p_align over a 64-bit little-endian ELF's PT_LOAD segments, or null if it is not one. */
function elfLoadAlign(buf) {
  if (buf.length < 64 || buf.readUInt32BE(0) !== 0x7f454c46 || buf[4] !== 2 || buf[5] !== 1) return null;
  const phoff = Number(buf.readBigUInt64LE(32));
  const phentsize = buf.readUInt16LE(54);
  const phnum = buf.readUInt16LE(56);
  let min = Infinity;
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (o + 56 > buf.length) return null;
    if (buf.readUInt32LE(o) === 1) min = Math.min(min, Number(buf.readBigUInt64LE(o + 48)));
  }
  return min === Infinity ? null : min;
}

function attr(xml, tag, name) {
  const el = new RegExp(`<${tag}\\b[^>]*>`, 's').exec(xml)?.[0] ?? '';
  return new RegExp(`android:${name}="([^"]*)"`).exec(el)?.[1] ?? (name === 'package' ? /\spackage="([^"]*)"/.exec(el)?.[1] : undefined);
}

function verify(app, work, info, sdk) {
  step('verify bundle');
  const android = join(work, 'android');
  const aab = join(android, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  if (!existsSync(aab)) fail(`Gradle finished but ${relative(ROOT, aab)} does not exist`);
  const problems = [];

  const mdir = join(android, 'app', 'build', 'intermediates', 'merged_manifest', 'release');
  const merged = existsSync(mdir) ? filesUnder(mdir).find((f) => f.endsWith('AndroidManifest.xml')) : null;
  if (!merged) fail(`merged release manifest not found under ${relative(ROOT, mdir)}`);
  const xml = readFileSync(merged, 'utf8');
  const facts = {
    package: attr(xml, 'manifest', 'package'),
    versionCode: attr(xml, 'manifest', 'versionCode'),
    versionName: attr(xml, 'manifest', 'versionName'),
    minSdk: attr(xml, 'uses-sdk', 'minSdkVersion'),
    targetSdk: attr(xml, 'uses-sdk', 'targetSdkVersion'),
    debuggable: attr(xml, 'application', 'debuggable') ?? '(not set = false)',
    cleartext: attr(xml, 'application', 'usesCleartextTraffic'),
    allowBackup: attr(xml, 'application', 'allowBackup'),
    dataExtractionRules: attr(xml, 'application', 'dataExtractionRules'),
    orientation: attr(xml, 'activity', 'screenOrientation'),
    permissions: [...xml.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].map((m) => m[1]),
  };
  if (facts.package !== app.applicationId) problems.push(`package ${facts.package} != ${app.applicationId}`);
  if (facts.versionCode !== String(info.versionCode)) problems.push(`versionCode ${facts.versionCode} != ${info.versionCode}`);
  if (!(Number(facts.targetSdk) >= MIN_TARGET_SDK)) problems.push(`targetSdk ${facts.targetSdk} < ${MIN_TARGET_SDK}`);
  if (facts.debuggable === 'true') problems.push('application is debuggable');
  if (facts.cleartext !== 'false') problems.push(`usesCleartextTraffic is ${facts.cleartext}, expected false`);
  if (facts.allowBackup !== 'false') problems.push(`allowBackup is ${facts.allowBackup}, expected false`);
  if (facts.dataExtractionRules !== '@xml/data_extraction_rules') problems.push('dataExtractionRules missing (saves could be transferred off the device)');
  if (facts.orientation !== 'portrait') problems.push(`screenOrientation is ${facts.orientation}`);
  const portraitFeature = [...xml.matchAll(/<uses-feature\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes('"android.hardware.screen.portrait"'));
  if (!portraitFeature?.includes('android:required="false"')) {
    problems.push('android.hardware.screen.portrait is not declared optional (Play limits devices)');
  }
  // Permissions the shell itself adds: INTERNET (Capacitor template) and AndroidX core's
  // signature-protected DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION (own package only).
  // Play Games (apps with a playGames block) may add ACCESS_NETWORK_STATE; never the AD_ID one
  // (the Console's advertising ID declaration says no).
  // AdMob apps: the Mobile Ads SDK (play-services-ads) declares ACCESS_NETWORK_STATE, and its
  // WorkManager dependency WAKE_LOCK, RECEIVE_BOOT_COMPLETED and FOREGROUND_SERVICE (normal
  // permissions, no user data). AD_ID and the Privacy Sandbox ones are removed (patchAdMob).
  const pgs = Boolean(app.playGames);
  const ads = Boolean(app.ads);
  const adsPerms = ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.WAKE_LOCK', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.FOREGROUND_SERVICE'];
  const okPerm = (p) =>
    p === 'android.permission.INTERNET' ||
    p === `${app.applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` ||
    (pgs && p === 'android.permission.ACCESS_NETWORK_STATE') ||
    (ads && adsPerms.includes(p));
  for (const p of facts.permissions.filter((p) => !okPerm(p))) problems.push(`unexpected permission ${p}`);
  for (const p of ADMOB_REMOVED_PERMISSIONS) if (facts.permissions.includes(p)) problems.push(`${p} is in the merged manifest (child-directed app: must be removed)`);
  const adMeta = /<meta-data\b[^>]*android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*>/.exec(xml)?.[0];
  const adAppId = adMeta ? /android:value="([^"]*)"/.exec(adMeta)?.[1] : undefined;
  if (ads && adAppId !== app.ads.appId) problems.push(`AdMob APPLICATION_ID meta-data is ${adAppId ?? 'missing'}, want ${app.ads.appId} (store/apps.json)`);
  if (!ads && adMeta) problems.push('AdMob APPLICATION_ID meta-data in an app without ads');
  facts.admob = ads ? { appId: adAppId, rewarded: app.ads.rewarded, test: app.ads.test } : false;
  problems.push(...checkMergedPlayGames(xml, pgs));
  facts.playGames = pgs;

  const entries = run('jar', ['tf', aab], { capture: true }).split(/\r?\n/).filter(Boolean);
  const assets = entries.filter((e) => e.startsWith('base/assets/public/'));
  if (!entries.includes('base/assets/public/index.html')) problems.push('base/assets/public/index.html missing from the bundle');
  const libs = entries.filter((e) => e.startsWith('base/lib/'));
  // Native code is allowed only from an ad SDK (AdMob's plugin brings a small PNG decoder), and only
  // in the shape Play requires: a 64-bit build next to every 32-bit one, and every 64-bit library's
  // LOAD segments aligned to 16 KB (Android 15+ devices with 16 KB pages).
  const soFiles = libs.filter((e) => e.endsWith('.so'));
  if (soFiles.length && !ads) problems.push(`native libraries in an app without an ad SDK: ${soFiles.slice(0, 5).join(', ')}`);
  for (const so of soFiles) {
    const abi = so.split('/')[2];
    const name = so.split('/').pop();
    if ((abi === 'armeabi-v7a' && !soFiles.includes(`base/lib/arm64-v8a/${name}`)) || (abi === 'x86' && !soFiles.includes(`base/lib/x86_64/${name}`))) problems.push(`${so}: no 64-bit build`);
    if (abi !== 'arm64-v8a' && abi !== 'x86_64') continue;
    const align = elfLoadAlign(execFileSync('unzip', ['-p', aab, so], { maxBuffer: 256 * 1024 * 1024 }));
    if (align === null) problems.push(`${so}: not a 64-bit ELF library`);
    else if (align < 16384) problems.push(`${so}: LOAD segments aligned to ${align} bytes, Play needs 16 KB`);
  }
  facts.nativeLibs = soFiles.map((e) => e.slice('base/lib/'.length));
  // AdMob compiled in (or not): the plugin and the SDK classes in the dex files, and the plugin in
  // Capacitor's generated plugin list (BridgeActivity registers the plugins listed there).
  const dex = entries.filter((e) => /^base\/dex\/classes\d*\.dex$/.test(e)).map((e) => execFileSync('unzip', ['-p', aab, e], { maxBuffer: 256 * 1024 * 1024 }));
  const inDex = (cls) => dex.some((b) => b.includes(Buffer.from(cls)));
  const adClasses = ['Lcom/getcapacitor/community/admob/AdMob;', 'Lcom/google/android/gms/ads/MobileAds;'];
  const pluginList = entries.includes('base/assets/capacitor.plugins.json') ? execFileSync('unzip', ['-p', aab, 'base/assets/capacitor.plugins.json'], { encoding: 'utf8' }) : '';
  if (ads) {
    for (const c of adClasses) if (!inDex(c)) problems.push(`${c} not in the bundle's dex (AdMob plugin/SDK not compiled in)`);
    if (!pluginList.includes('com.getcapacitor.community.admob.AdMob')) problems.push('AdMob plugin missing from assets/capacitor.plugins.json');
  } else if (adClasses.some(inDex)) problems.push('Google Mobile Ads classes in an app without ads');
  const wwwCount = filesUnder(join(work, 'www')).length;
  if (assets.filter((e) => !e.endsWith('/')).length < wwwCount) problems.push(`bundle has ${assets.length} web files, www/ has ${wwwCount}`);

  // Full screen: read the bundle's own manifest and resource table (proto format) with aapt2,
  // repacked as a base-module zip it can open: the activity starts with the launch theme, and
  // that theme and the ones after it have no action bar or title (tools/aab/theme.mjs).
  const buildTools = existsSync(join(sdk, 'build-tools')) ? readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  const aapt2 = buildTools.map((v) => join(sdk, 'build-tools', v, WIN ? 'aapt2.exe' : 'aapt2')).filter((f) => existsSync(f)).at(-1);
  let themes = { summary: [] };
  if (!aapt2) problems.push(`no aapt2 in ${join(sdk, 'build-tools')}: cannot check the themes`);
  else {
    const base = join(work, 'theme-check');
    rmSync(base, { recursive: true, force: true });
    mkdirSync(join(base, 'p'), { recursive: true });
    writeFileSync(join(base, 'p', 'resources.pb'), execFileSync('unzip', ['-p', aab, 'base/resources.pb'], { maxBuffer: 64 * 1024 * 1024 }));
    writeFileSync(join(base, 'p', 'AndroidManifest.xml'), execFileSync('unzip', ['-p', aab, 'base/manifest/AndroidManifest.xml']));
    run('jar', ['cfM', join(base, 'base.zip'), '-C', join(base, 'p'), '.']);
    const tree = run(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', join(base, 'base.zip')], { capture: true });
    const activityTheme = /E: activity[\s\S]*?android:theme\(0x01010000\)=@style\/(\S+)/.exec(tree)?.[1];
    if (activityTheme !== 'AppTheme.NoActionBarLaunch') problems.push(`activity theme is ${activityTheme ?? 'missing'}, expected AppTheme.NoActionBarLaunch`);
    themes = checkThemeDump(run(aapt2, ['dump', 'resources', join(base, 'base.zip')], { capture: true }), ['AppTheme', 'AppTheme.NoActionBar', 'AppTheme.NoActionBarLaunch']);
    problems.push(...themes.problems);
  }

  const sig = spawnSync('jarsigner', ['-verify', aab], { encoding: 'utf8' });
  if (sig.status !== 0 || !/jar verified/.test(sig.stdout)) problems.push(`jarsigner -verify: ${(sig.stdout + sig.stderr).trim().split('\n').slice(-2).join(' ')}`);
  const cert = spawnSync('keytool', ['-printcert', '-jarfile', aab], { encoding: 'utf8' });
  const certSha = /SHA256:\s*([0-9A-F:]+)/.exec(cert.stdout)?.[1];
  if (certSha !== info.uploadCertSha256) problems.push(`bundle certificate ${certSha} is not the upload key ${info.uploadCertSha256}`);

  if (problems.length) fail(`bundle check:\n  ${problems.join('\n  ')}`);
  console.log(`manifest: ${JSON.stringify(facts)}`);
  console.log(`themes: activity = AppTheme.NoActionBarLaunch; ${themes.summary.join('; ')}`);
  console.log(`contents: ${assets.filter((e) => !e.endsWith('/')).length} web files under base/assets/public/, ${soFiles.length ? `native libs (16 KB aligned): ${facts.nativeLibs.join(', ')}` : 'no native libraries'}${ads ? ', AdMob plugin + Mobile Ads SDK compiled in' : ', no ad SDK'}`);
  console.log(`signature: jar verified, upload certificate SHA-256 ${certSha}`);
  return { aab, facts };
}

function deliver(app, aab, info, facts, iconNote) {
  step('deliver');
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${app.slug}-release.aab`);
  copyFileSync(aab, out);
  const buf = readFileSync(out);
  const report = {
    slug: app.slug,
    applicationId: app.applicationId,
    versionCode: info.versionCode,
    versionName: info.versionName,
    platform: app.platform,
    commit: info.commit,
    builtAt: info.builtAt,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    uploadCertSha256: info.uploadCertSha256,
    minSdk: Number(facts.minSdk),
    targetSdk: Number(facts.targetSdk),
    permissions: facts.permissions,
    admob: facts.admob,
    icon: iconNote,
  };
  writeFileSync(join(OUT_DIR, `${app.slug}-release.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nAAB: ${out}`);
  console.log(`${app.applicationId} versionCode ${info.versionCode} versionName ${info.versionName}`);
  console.log(`size: ${(buf.length / 1024 / 1024).toFixed(2)} MB (${buf.length} bytes), sha256 ${report.sha256}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---------------------------------------------------------------- main
const slug = process.argv[2];
const app = loadApp(slug);
const { sdk, signEnv, uploadCertSha256 } = preflight();
const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown';
const dirty = git(['status', '--porcelain']) !== '';
const now = new Date();
// versionCode = minutes since 2026-01-01 UTC: grows with every build on any machine (local or
// CI), the same rule for all three apps, no counter to store; Android's ceiling (2 100 000 000)
// is ~4000 years away. Two builds of one app in the same minute share a code: Play rejects the
// second upload, rebuild a minute later.
const versionCode = process.env.OYUN_VERSION_CODE ? Number(process.env.OYUN_VERSION_CODE) : Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000);
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) fail(`bad versionCode ${process.env.OYUN_VERSION_CODE}`);
const info = {
  versionCode,
  versionName: `${app.versionName}-${dirty ? `${commit}-dirty` : commit}`,
  commit: dirty ? `${commit}-dirty` : commit,
  builtAt: now.toISOString(),
  uploadCertSha256,
};
console.log(`${app.slug} → ${app.applicationId}, versionCode ${info.versionCode}, versionName ${info.versionName}`);
const work = join(OUT_DIR, 'aab', app.slug);
mkdirSync(work, { recursive: true });
buildWeb(app, work);
checkWeb(app, join(work, 'www'));
capacitor(app, work);
const iconNote = patchNative(app, work, info);
gradle(work, sdk, signEnv);
const { aab, facts } = verify(app, work, info, sdk);
deliver(app, aab, info, facts, iconNote);

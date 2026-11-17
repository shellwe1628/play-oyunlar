#!/usr/bin/env node
// One debug APK with every real game behind a launcher screen (apps/test-paketi).
//   npm run apk
// Needs: Node >= 22.12, JDK 21, an Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT) with
// platforms;android-36 and build-tools. See apps/test-paketi/README.md for the exact install.
// Steps: preflight → launcher build → each game built into the launcher's dist/<slug>/ with the
// web platform adapter → offline/relative-path checks → Capacitor add/sync → native patches →
// Gradle assembleDebug → build/play-oyunlar-test.apk.
// Env: OYUN_GRADLE=<gradle binary> uses that instead of the project's ./gradlew (same version).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { foregroundVector, adaptiveIconXml, ICON_BG, LEGACY_SIZES, legacyIconPng } from '../apps/test-paketi/native/icon.mjs';
import { ROOT } from './template.mjs';

/** Games in the APK, in launcher order (must match apps/test-paketi/src/games.ts). */
export const SLUGS = ['kivilcim', 'okcu', 'fosil'];
const APP_ID = 'com.playoyunlar.testpaketi';
const APP_NAME = 'Play Oyunlar Test';
const APP = join(ROOT, 'apps', 'test-paketi');
const WEB = join(APP, 'dist');
const ANDROID = join(APP, 'android');
const OUT_DIR = join(ROOT, 'build');
const OUT = join(OUT_DIR, 'play-oyunlar-test.apk');
const BIN = join(ROOT, 'node_modules', '.bin');

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
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
  });
  if (r.error) fail(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${r.status} (cwd ${opts.cwd ?? ROOT})`);
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

// ---------------------------------------------------------------- preflight
function preflight() {
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
  const buildTools = existsSync(join(sdk, 'build-tools')) ? readdirSync(join(sdk, 'build-tools')) : [];
  if (!buildTools.length) fail(`Android SDK at ${sdk} has no build-tools.\n${howTo}`);
  for (const slug of SLUGS) if (!existsSync(join(ROOT, 'games', slug, 'oyun.config.json'))) fail(`games/${slug} is missing`);
  console.log(`node ${process.versions.node}, java ${jv[1]}, SDK ${sdk} (android-36, build-tools ${buildTools.join(', ')})`);
  return { sdk, buildTools };
}

// ---------------------------------------------------------------- web
function buildWeb(info) {
  step('launcher');
  run(join(BIN, 'vite'), ['build'], { cwd: APP, env: { OYUN_BUILD_DATE: info.date, OYUN_BUILD_COMMIT: info.commit } });

  for (const slug of SLUGS) {
    step(`game ${slug} → dist/${slug}/ (web platform adapter)`);
    // VITE_OYUN_PLATFORM=web: core's build-time choice beats the Capacitor native shell, so
    // rewarded ads resolve 'granted' in this test APK. Only these builds get it; the games'
    // own dist/ and the gate are untouched.
    run(join(BIN, 'vite'), ['build', '--base', './', '--outDir', join(WEB, slug), '--emptyOutDir'], {
      cwd: join(ROOT, 'games', slug),
      env: { VITE_OYUN_PLATFORM: 'web' },
    });
  }
}

/** Every path relative, nothing fetched from the network, the web adapter baked in. */
function checkWeb() {
  step('check web folder');
  const problems = [];
  const files = filesUnder(WEB);
  for (const slug of ['', ...SLUGS]) {
    const html = join(WEB, slug, 'index.html');
    if (!existsSync(html)) {
      problems.push(`missing ${relative(WEB, html)}`);
      continue;
    }
    const text = readFileSync(html, 'utf8');
    if (!text.includes('viewport-fit=cover')) problems.push(`${relative(WEB, html)}: no viewport-fit=cover`);
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
      const url = m[1];
      if (url.startsWith('data:')) continue;
      if (!url.startsWith('./')) problems.push(`${relative(WEB, html)}: non-relative URL ${url}`);
      else if (!existsSync(join(WEB, slug, url))) problems.push(`${relative(WEB, html)}: ${url} does not exist`);
    }
  }
  for (const f of files) {
    const rel = relative(WEB, f);
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
  for (const slug of SLUGS) {
    const js = filesUnder(join(WEB, slug)).filter((f) => f.endsWith('.js'));
    // Vite inlines import.meta.env.VITE_OYUN_PLATFORM as a string literal.
    if (!js.some((f) => /forced:\s*["'`]web["'`]/.test(readFileSync(f, 'utf8')))) problems.push(`${slug}: web platform choice not found in the bundle`);
  }
  if (problems.length) fail(`web folder check:\n  ${problems.join('\n  ')}`);
  const kb = Math.round(files.reduce((s, f) => s + statSync(f).size, 0) / 1024);
  console.log(`ok: ${files.length} files, ${kb} KB, launcher + ${SLUGS.join(', ')}; relative paths, no external URLs, web adapter`);
}

// ---------------------------------------------------------------- native
function capacitor() {
  step('capacitor');
  const cap = join(BIN, 'cap');
  if (!existsSync(join(ANDROID, 'app', 'build.gradle'))) {
    if (existsSync(ANDROID)) rmSync(ANDROID, { recursive: true, force: true }); // half-made folder
    run(cap, ['add', 'android'], { cwd: APP });
  }
  run(cap, ['sync', 'android'], { cwd: APP });
}

function patchNative(info) {
  step('patch android/ (orientation, name, icon, splash, back button, edge to edge)');
  const main = join(ANDROID, 'app', 'src', 'main');
  const res = join(main, 'res');

  // Portrait only on phones (Android 16 ignores it on large screens, sw >= 600dp).
  edit(join(main, 'AndroidManifest.xml'), (xml) =>
    xml.includes('android:screenOrientation=')
      ? xml.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="portrait"')
      : replaceOnce(xml, /android:name="\.MainActivity"/, 'android:name=".MainActivity"\n            android:screenOrientation="portrait"', 'AndroidManifest activity'),
  );

  edit(join(res, 'values', 'strings.xml'), (xml) =>
    xml
      .replace(/<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${APP_NAME}</string>`)
      .replace(/<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${APP_NAME}</string>`),
  );

  // versionName shows the build in Settings → Apps. versionCode grows with build time (minutes
  // since 2026-01-01 UTC), so every new test APK installs over an older one as an update (the
  // first APK of 2026-11-17 had versionCode 1); Android's ceiling of 2.1e9 is ~4000 years away.
  edit(join(ANDROID, 'app', 'build.gradle'), (g) =>
    replaceOnce(
      replaceOnce(g, /versionName "[^"]*"/, `versionName "test-${info.date}-${info.commit}"`, 'app/build.gradle versionName'),
      /versionCode \d+/,
      `versionCode ${info.versionCode}`,
      'app/build.gradle versionCode',
    ),
  );

  // MainActivity: back button + edge to edge (see the comments in the source).
  const pkgDir = join(main, 'java', ...APP_ID.split('.'));
  const activity = join(pkgDir, 'MainActivity.java');
  if (!existsSync(activity)) fail(`MainActivity not found at ${relative(ROOT, activity)} (did cap add use appId ${APP_ID}?)`);
  writeFileSync(activity, readFileSync(join(APP, 'native', 'MainActivity.java'), 'utf8').replace('__PACKAGE__', APP_ID));

  // Icon: adaptive (vector) for API 26+, generated PNGs for API 24-25. Capacitor's default
  // foreground PNGs are removed so only our icon ships.
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

  // Splash: plain launcher colour instead of Capacitor's logo images.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) rmSync(join(res, dir, 'splash.png'), { force: true });
  writeFileSync(
    join(res, 'drawable', 'splash.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n    <solid android:color="${ICON_BG}"/>\n</shape>\n`,
  );
}

function gradle(sdk) {
  step('gradle assembleDebug');
  writeFileSync(join(ANDROID, 'local.properties'), `sdk.dir=${sdk}\n`);
  const own = process.env.OYUN_GRADLE;
  const gradlew = join(ANDROID, 'gradlew');
  if (!own) run('chmod', ['+x', gradlew]);
  // --no-daemon: nothing keeps running after the build.
  run(own || gradlew, ['assembleDebug', '--no-daemon', '--console=plain', '--warning-mode=summary'], { cwd: ANDROID });
}

function deliver() {
  step('deliver');
  const apk = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!existsSync(apk)) fail(`Gradle finished but ${relative(ROOT, apk)} does not exist`);
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(apk, OUT);
  const bytes = statSync(OUT).size;
  console.log(`\nAPK: ${OUT}`);
  console.log(`size: ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes} bytes)`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---------------------------------------------------------------- main
const { sdk } = preflight();
const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown';
const dirty = git(['status', '--porcelain']) !== '';
const now = new Date();
const info = {
  date: now.toISOString().slice(0, 10),
  commit: dirty ? `${commit}-dirty` : commit,
  versionCode: Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000),
};
console.log(`build ${info.date} ${info.commit}, versionCode ${info.versionCode}`);
buildWeb(info);
checkWeb();
capacitor();
patchNative(info);
gradle(sdk);
deliver();

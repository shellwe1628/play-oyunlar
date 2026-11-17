#!/usr/bin/env node
// Release Android App Bundle for ONE game, as its own Google Play app.
//   npm run aab -- <slug>                     → build/<slug>-release.aab (+ build/<slug>-release.json)
//
// Per-app settings come from store/apps.json (application id, names per language, version name,
// platform adapter, colours); nothing in games/<slug>/ is edited. Each run builds from scratch in
// build/aab/<slug>/ (git-ignored): web bundle → offline/URL check → fresh Capacitor Android
// project → patches (id, names, portrait, back button, edge to edge, icon, splash, no cleartext,
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
import { ROOT } from './template.mjs';

const BIN = join(ROOT, 'node_modules', '.bin');
const OUT_DIR = join(ROOT, 'build');
/** Lowest targetSdk this script accepts. Play's yearly target-API rule: check the Console. */
const MIN_TARGET_SDK = 35;
/** Same allow-list as tools/apk.mjs: XML namespaces and Phaser's (disabled) banner link. */
const ALLOWED_URLS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'https://phaser.io', 'https://phaser.io/']);
const SIGNING_ENV = ['OYUN_UPLOAD_KEYSTORE', 'OYUN_UPLOAD_KEYSTORE_PASSWORD', 'OYUN_UPLOAD_KEY_ALIAS'];

const t0 = Date.now();
const step = (msg) => console.log(`\n=== ${msg}`);

function fail(msg) {
  console.error(`\naab: FAILED\n${msg}\n`);
  process.exit(1);
}

/** Runs a command; arguments are printed, the environment never is. */
function run(cmd, args, opts = {}) {
  console.log(`$ ${relative(ROOT, opts.cwd ?? ROOT) || '.'}: ${cmd.replace(`${BIN}/`, '')} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: ['ignore', opts.capture ? 'pipe' : 'inherit', opts.capture ? 'pipe' : 'inherit'],
    encoding: 'utf8',
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
  if (!existsSync(join(ROOT, 'games', slug, 'oyun.config.json'))) fail(`games/${slug} is missing`);
  const meta = JSON.parse(readFileSync(join(ROOT, 'games', slug, 'oyun.config.json'), 'utf8'));
  if (meta.orientation !== 'portrait') fail(`${slug}: oyun.config.json orientation is ${meta.orientation}; this script locks portrait`);
  return { ...app, defaultLanguage: cfg.defaultLanguage, languages: cfg.languages };
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
  step(`web bundle (VITE_OYUN_PLATFORM=${app.platform})`);
  run(join(BIN, 'vite'), ['build', '--base', './', '--outDir', join(work, 'www'), '--emptyOutDir'], {
    cwd: join(ROOT, 'games', app.slug),
    env: { VITE_OYUN_PLATFORM: app.platform },
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
  if (!js.some((f) => forced.test(readFileSync(f, 'utf8')))) problems.push(`platform choice "${app.platform}" not found in the bundle`);
  if (problems.length) fail(`web bundle check:\n  ${problems.join('\n  ')}`);
  const kb = Math.round(files.reduce((s, f) => s + statSync(f).size, 0) / 1024);
  console.log(`ok: ${files.length} files, ${kb} KB; relative paths, no external URLs, ${app.platform} adapter`);
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
      // env(safe-area-inset-*) (index.html has viewport-fit=cover). DARK = light bar icons.
      SystemBars: { insetsHandling: 'css', style: 'DARK', initialViewportFitValueHint: 'cover' },
    },
  };
  writeFileSync(join(work, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(work, 'package.json'), `${JSON.stringify({ name: `aab-${app.slug}`, private: true, type: 'module' }, null, 2)}\n`);
  rmSync(join(work, 'android'), { recursive: true, force: true });
  run(join(BIN, 'cap'), ['add', 'android'], { cwd: work });
}

function patchNative(app, work, info) {
  step('patch android/ (id, names, portrait, back button, edge to edge, icon, splash, cleartext, backup, signing)');
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
    return x;
  });
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

  // MainActivity: back button (press twice → background) + edge to edge.
  const activity = join(main, 'java', ...app.applicationId.split('.'), 'MainActivity.java');
  if (!existsSync(activity)) fail(`MainActivity not found at ${relative(ROOT, activity)} (did cap add use appId ${app.applicationId}?)`);
  writeFileSync(activity, readFileSync(join(ROOT, 'tools', 'aab', 'MainActivity.java'), 'utf8').replace('__PACKAGE__', app.applicationId));

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

function gradle(work, sdk, signEnv) {
  step('gradle bundleRelease');
  const android = join(work, 'android');
  writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk}\n`);
  const own = process.env.OYUN_GRADLE;
  if (!own) run('chmod', ['+x', join(android, 'gradlew')]);
  // --no-daemon: nothing keeps running after the build.
  run(own || join(android, 'gradlew'), ['bundleRelease', '--no-daemon', '--console=plain', '--warning-mode=summary'], { cwd: android, env: signEnv });
}

// ---------------------------------------------------------------- checks + delivery
function attr(xml, tag, name) {
  const el = new RegExp(`<${tag}\\b[^>]*>`, 's').exec(xml)?.[0] ?? '';
  return new RegExp(`android:${name}="([^"]*)"`).exec(el)?.[1] ?? (name === 'package' ? /\spackage="([^"]*)"/.exec(el)?.[1] : undefined);
}

function verify(app, work, info) {
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
  // Permissions the shell itself adds: INTERNET (Capacitor template) and AndroidX core's
  // signature-protected DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION (own package only).
  const okPerm = (p) => p === 'android.permission.INTERNET' || p === `${app.applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
  for (const p of facts.permissions.filter((p) => !okPerm(p))) problems.push(`unexpected permission ${p}`);

  const entries = run('jar', ['tf', aab], { capture: true }).split('\n').filter(Boolean);
  const assets = entries.filter((e) => e.startsWith('base/assets/public/'));
  if (!entries.includes('base/assets/public/index.html')) problems.push('base/assets/public/index.html missing from the bundle');
  const libs = entries.filter((e) => e.startsWith('base/lib/'));
  if (libs.length) problems.push(`native libraries in the bundle (64-bit / 16 KB page checks needed): ${libs.slice(0, 5).join(', ')}`);
  const wwwCount = filesUnder(join(work, 'www')).length;
  if (assets.filter((e) => !e.endsWith('/')).length < wwwCount) problems.push(`bundle has ${assets.length} web files, www/ has ${wwwCount}`);

  const sig = spawnSync('jarsigner', ['-verify', aab], { encoding: 'utf8' });
  if (sig.status !== 0 || !/jar verified/.test(sig.stdout)) problems.push(`jarsigner -verify: ${(sig.stdout + sig.stderr).trim().split('\n').slice(-2).join(' ')}`);
  const cert = spawnSync('keytool', ['-printcert', '-jarfile', aab], { encoding: 'utf8' });
  const certSha = /SHA256:\s*([0-9A-F:]+)/.exec(cert.stdout)?.[1];
  if (certSha !== info.uploadCertSha256) problems.push(`bundle certificate ${certSha} is not the upload key ${info.uploadCertSha256}`);

  if (problems.length) fail(`bundle check:\n  ${problems.join('\n  ')}`);
  console.log(`manifest: ${JSON.stringify(facts)}`);
  console.log(`contents: ${assets.filter((e) => !e.endsWith('/')).length} web files under base/assets/public/, no native libraries`);
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
const { aab, facts } = verify(app, work, info);
deliver(app, aab, info, facts, iconNote);

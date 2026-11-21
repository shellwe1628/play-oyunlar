#!/usr/bin/env node
// iOS App Store build for ONE game (macOS + Xcode only), the iOS twin of tools/aab.mjs.
//   node tools/ipa.mjs <slug> --unsigned   compile check: Release build for a generic iPhone,
//                                          no signing, no Apple account needed (CI: ios-dene.yml)
//   node tools/ipa.mjs <slug>              signed archive + build/<slug>-appstore.ipa
//   node tools/ipa.mjs <slug> --upload     signed archive, uploaded straight to App Store Connect
//
// Per-app settings come from store/apps.json (bundle id = applicationId unless ios.bundleId,
// names, ios.version, ios.gameCenter); nothing in games/<slug>/ is edited. Each run builds from
// scratch in build/ipa/<slug>/ (git-ignored): web bundle → offline/URL check → fresh Capacitor iOS
// project → patches (bundle id, name, iPhone only, portrait, full screen, no status bar, export
// compliance, privacy manifest, icon, launch image, Game Center plugin + entitlement) → xcodebuild
// → checks on the built app's Info.plist and bundle.
//
// Signing (signed modes only), ONLY from the environment, never printed:
//   APPLE_TEAM_ID        10-character team id (developer.apple.com → Membership)
//   ASC_KEY_ID           App Store Connect API key id
//   ASC_ISSUER_ID        its issuer id
//   ASC_KEY_PATH         path to the AuthKey_<id>.p8 file (outside the repository)
// Xcode's automatic signing uses the key to create the App ID, certificate and profile itself.
// Optional: OYUN_BUILD_NUMBER=<n> overrides CFBundleVersion (default: minutes since 2026-01-01,
// the same rule as Android's versionCode).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ADMOB_PLUGIN, admobIds, admobPluginVersion, admobViteEnv, checkBundleAdIds, SKADNETWORK_IDS, usesPlatformAdapter } from './admob.mjs';
import { ROOT } from './template.mjs';

const BIN = join(ROOT, 'node_modules', '.bin');
const OUT_DIR = join(ROOT, 'build');
const HERE = join(ROOT, 'tools', 'ipa');
// + the games' own privacy policy pages, linked from the online panel (App Store 5.1.1)
const ALLOWED_URLS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'https://phaser.io', 'https://phaser.io/', ...['fosil', 'kivilcim', 'okcu'].map((s) => `https://oyunlar.carsihani.me/gizlilik/${s}/`)]);
const SIGNING_ENV = ['APPLE_TEAM_ID', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_PATH'];
const UNSIGNED = process.argv.includes('--unsigned');
const UPLOAD = process.argv.includes('--upload');

const t0 = Date.now();
const step = (msg) => console.log(`\n=== ${msg}`);

function fail(msg) {
  console.error(`\nipa: FAILED\n${msg}\n`);
  process.exit(1);
}

/** Runs a command; arguments are printed (secrets never go in argv: paths and ids only). */
function run(cmd, args, opts = {}) {
  console.log(`$ ${relative(ROOT, opts.cwd ?? ROOT) || '.'}: ${cmd.startsWith(BIN) ? relative(BIN, cmd) : cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: ['ignore', opts.capture ? 'pipe' : 'inherit', opts.capture ? 'pipe' : 'inherit'],
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
  });
  if (r.error) fail(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${r.status}${opts.capture ? `\n${r.stdout}${r.stderr}` : ''}`);
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

/** plutil edits on an XML/binary plist (macOS's own tool). */
const plist = (file, ...args) => run('plutil', [...args, file], { capture: true });
const plistJson = (file) => JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', file], { capture: true }));

// ---------------------------------------------------------------- settings
function loadApp(slug) {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
  const app = cfg.apps.find((a) => a.slug === slug);
  const slugs = cfg.apps.map((a) => a.slug).join(', ');
  if (!slug || slug.startsWith('-')) fail(`usage: node tools/ipa.mjs <slug> [--unsigned|--upload]   (one of: ${slugs})`);
  if (!app) fail(`store/apps.json has no app "${slug}" (has: ${slugs})`);
  const ios = app.ios ?? {};
  const bundleId = ios.bundleId ?? app.applicationId;
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(bundleId)) fail(`${slug}: bundle id "${bundleId}" is not valid`);
  const version = ios.version ?? '1.0.0';
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) fail(`${slug}: ios.version must look like 1.0 or 1.0.0, not "${version}"`);
  const source = app.source ?? join('games', slug);
  if (!existsSync(join(ROOT, source, 'index.html'))) fail(`${slug}: ${source} is missing`);
  const art = join(ROOT, 'store', slug, 'appstore');
  for (const f of ['icon-1024.png', 'splash-2732.png']) if (!existsSync(join(art, f))) fail(`${slug}: store/${slug}/appstore/${f} missing: run node store/tools/appstore.mjs ${slug} --only icon`);
  const boards = ios.gameCenter?.boards ?? null;
  if (boards) for (const [k, v] of Object.entries(boards)) if (!/^[a-z][a-z0-9_]*$/.test(k) || !/^[A-Za-z0-9._]+$/.test(v)) fail(`${slug}: bad ios.gameCenter board ${k}=${v}`);
  return { ...app, source, bundleId, version, boards, art, ads: admobApp(app, source), defaultLanguage: cfg.defaultLanguage };
}

// ---------------------------------------------------------------- preflight
function preflight() {
  step('preflight');
  if (process.platform !== 'darwin') fail('iOS builds need macOS with Xcode (GitHub: runs-on macos-15).');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) fail(`Node >= 22.12 needed, found ${process.versions.node}`);
  console.log(run('xcodebuild', ['-version'], { capture: true }).trim().replace(/\n/g, ', '));
  if (spawnSync('ruby', ['-rxcodeproj', '-e', '1']).status !== 0) fail('ruby gem xcodeproj missing: gem install xcodeproj');
  if (!existsSync(join(ROOT, 'node_modules', '@capacitor', 'ios'))) fail('@capacitor/ios is not installed (npm ci at the repo root)');
  if (UNSIGNED) return {};
  const missing = SIGNING_ENV.filter((n) => !process.env[n]);
  if (missing.length) fail(`signed builds read the Apple key only from the environment; missing: ${missing.join(', ')}`);
  const key = resolve(process.env.ASC_KEY_PATH);
  if (!existsSync(key)) fail('ASC_KEY_PATH points to a file that does not exist');
  if (!relative(ROOT, key).startsWith('..')) fail('the App Store Connect key must live outside the repository');
  if (!/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID)) fail('APPLE_TEAM_ID must be the 10-character team id');
  return { key, team: process.env.APPLE_TEAM_ID, keyId: process.env.ASC_KEY_ID, issuer: process.env.ASC_ISSUER_ID };
}

// ---------------------------------------------------------------- web
function buildWeb(app, work) {
  step(`web bundle from ${app.source}`);
  run(join(BIN, 'vite'), ['build', '--base', './', '--outDir', join(work, 'www'), '--emptyOutDir'], {
    cwd: join(ROOT, app.source),
    env: { VITE_OYUN_PLATFORM: app.platform, ...admobViteEnv(app.ads) },
  });
  const www = join(work, 'www');
  const problems = checkBundleAdIds(filesUnder(www).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')), app.ads);
  for (const f of filesUnder(www)) {
    if (!/\.(js|css|html)$/.test(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+/g)) {
      const url = m[0].replace(/[),;'"]+$/, '');
      if (!ALLOWED_URLS.has(url)) problems.push(`${relative(www, f)}: external URL ${url}`);
    }
    // App Store Review 2.3.10: no other store's name in text the player can see. ("Android"
    // appears in engines' user-agent checks; "Google Play Games" only in the Android branch of
    // the online panel, packages/core/src/online/panel.ts.)
    const text = readFileSync(f, 'utf8').replaceAll('Google Play Games', '');
    for (const word of ['Google Play', 'Play Store', 'App Store']) if (text.includes(word)) problems.push(`${relative(www, f)}: mentions "${word}"`);
  }
  if (problems.length) fail(`web bundle check:\n  ${problems.join('\n  ')}`);
  console.log(`ok: relative paths, no external URLs${app.ads ? `, AdMob rewarded ${app.ads.rewarded}${app.ads.test ? ' (TEST ads)' : ''}` : ', no ad ids'}`);
}

// ---------------------------------------------------------------- native
function capacitor(app, work) {
  step('capacitor project (fresh)');
  const config = {
    appId: app.bundleId,
    appName: app.title[app.defaultLanguage],
    webDir: 'www',
    backgroundColor: app.background,
    ios: {
      contentInset: 'never',
      scrollEnabled: false,
      allowsLinkPreview: false,
      backgroundColor: app.background,
      webContentsDebuggingEnabled: false,
    },
  };
  writeFileSync(join(work, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  // plugins come from this package.json's dependencies, resolved upwards to the root node_modules
  const pkg = { name: `ipa-${app.slug}`, private: true, type: 'module', ...(app.ads ? { dependencies: { [ADMOB_PLUGIN]: app.ads.plugin } } : {}) };
  writeFileSync(join(work, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  rmSync(join(work, 'ios'), { recursive: true, force: true });
  run(join(BIN, 'cap'), ['add', 'ios'], { cwd: work });
}

function patchNative(app, work, info, sign) {
  step('patch ios/ (bundle id, name, iPhone only, portrait, full screen, compliance, privacy, icon, launch image, Game Center)');
  const appDir = join(work, 'ios', 'App', 'App');
  const infoPlist = join(appDir, 'Info.plist');
  const gc = Boolean(app.boards);

  plist(infoPlist, '-replace', 'CFBundleDisplayName', '-string', app.title[app.defaultLanguage]);
  plist(infoPlist, '-replace', 'UISupportedInterfaceOrientations', '-json', '["UIInterfaceOrientationPortrait"]');
  if ('UISupportedInterfaceOrientations~ipad' in plistJson(infoPlist)) plist(infoPlist, '-remove', 'UISupportedInterfaceOrientations~ipad');
  plist(infoPlist, '-replace', 'UIRequiresFullScreen', '-bool', 'YES');
  plist(infoPlist, '-replace', 'UIStatusBarHidden', '-bool', 'YES');
  plist(infoPlist, '-replace', 'UIViewControllerBasedStatusBarAppearance', '-bool', 'NO');
  // the game uses only HTTPS through the OS (Game Center) and no encryption of its own
  plist(infoPlist, '-replace', 'ITSAppUsesNonExemptEncryption', '-bool', 'NO');
  plist(infoPlist, '-replace', 'CFBundleDevelopmentRegion', '-string', 'en');
  plist(infoPlist, '-replace', 'CFBundleLocalizations', '-json', '["en","tr"]');
  if (gc) plist(infoPlist, '-replace', 'GCBoards', '-json', JSON.stringify(app.boards));
  if (app.ads) patchAdMobPlist(app, infoPlist);

  // the storyboard's bridge view controller → ours (plugin registration, full screen)
  edit(join(appDir, 'Base.lproj', 'Main.storyboard'), (x) => {
    const re = /customClass="CAPBridgeViewController" customModule="Capacitor"/;
    if (!re.test(x)) fail('Main.storyboard: CAPBridgeViewController not found (Capacitor template changed)');
    return x.replace(re, 'customClass="OyunViewController" customModule="App" customModuleProvider="target"');
  });
  const sources = ['OyunViewController.swift'];
  writeFileSync(
    join(appDir, 'OyunViewController.swift'),
    readFileSync(join(HERE, 'OyunViewController.swift'), 'utf8').replace('/*__PLUGINS__*/', gc ? 'bridge?.registerPluginInstance(GameCenterPlugin())' : '// no in-app plugins'),
  );
  if (gc) {
    copyFileSync(join(HERE, 'GameCenterPlugin.swift'), join(appDir, 'GameCenterPlugin.swift'));
    sources.push('GameCenterPlugin.swift');
    writeFileSync(
      join(appDir, 'App.entitlements'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>com.apple.developer.game-center</key>\n\t<true/>\n</dict>\n</plist>\n`,
    );
  }
  copyFileSync(join(HERE, 'PrivacyInfo.xcprivacy'), join(appDir, 'PrivacyInfo.xcprivacy'));

  // icon: Xcode's single 1024 size; launch image: every slot of Capacitor's Splash set
  const assets = join(appDir, 'Assets.xcassets');
  const iconSet = join(assets, 'AppIcon.appiconset');
  rmSync(iconSet, { recursive: true, force: true });
  mkdirSync(iconSet, { recursive: true });
  copyFileSync(join(app.art, 'icon-1024.png'), join(iconSet, 'AppIcon-1024.png'));
  writeFileSync(join(iconSet, 'Contents.json'), `${JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
  const splash = join(assets, 'Splash.imageset');
  if (!existsSync(splash)) fail('Assets.xcassets/Splash.imageset not found (Capacitor template changed)');
  const slots = JSON.parse(readFileSync(join(splash, 'Contents.json'), 'utf8')).images.map((i) => i.filename).filter(Boolean);
  for (const f of slots) copyFileSync(join(app.art, 'splash-2732.png'), join(splash, f));

  const settings = {
    PRODUCT_BUNDLE_IDENTIFIER: app.bundleId,
    MARKETING_VERSION: app.version,
    CURRENT_PROJECT_VERSION: String(info.build),
    TARGETED_DEVICE_FAMILY: '1',
    SUPPORTS_MACCATALYST: 'NO',
    SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
    SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: 'NO',
    ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
    SWIFT_VERSION: '5.0',
  };
  if (gc) settings.CODE_SIGN_ENTITLEMENTS = 'App/App.entitlements';
  // Archive straight with the distribution identity: automatic signing with "Apple Development"
  // needs a registered device for its development profile, which a CI-only team never has.
  if (sign.team) Object.assign(settings, { DEVELOPMENT_TEAM: sign.team, CODE_SIGN_STYLE: 'Automatic', CODE_SIGN_IDENTITY: 'Apple Distribution', 'CODE_SIGN_IDENTITY[sdk=iphoneos*]': 'Apple Distribution' });
  const plan = { sources, resources: ['PrivacyInfo.xcprivacy'], plain: gc ? ['App.entitlements'] : [], settings };
  const planFile = join(work, 'project-plan.json');
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
  run('ruby', [join(HERE, 'patch-project.rb'), join(work, 'ios', 'App', 'App.xcodeproj'), planFile]);
  run(join(BIN, 'cap'), ['sync', 'ios'], { cwd: work });
  checkAdMobLinked(app, work);
}

// ---------------------------------------------------------------- AdMob (tools/admob.mjs)
// Apps on the platform adapter (template games, apps/okcu-3d) built with platform "capacitor" show rewarded ads. Child-directed: the adapter
// tags requests TFCD/TFUA/G and non-personalised, and the app never asks for App Tracking
// Transparency: no NSUserTrackingUsageDescription, no IDFA. Info.plist gets the AdMob app id and
// Google's SKAdNetwork list (Google's own id first).

function admobApp(app, source) {
  if (app.platform !== 'capacitor') return null;
  if (!usesPlatformAdapter(join(ROOT, source))) fail(`${app.slug}: platform "capacitor" needs the platform adapter, which ${source} does not use`);
  try {
    return { ...admobIds(app, 'ios'), plugin: admobPluginVersion(), test: process.env.OYUN_ADMOB_TEST === '1' };
  } catch (e) {
    fail(e.message);
  }
}

function patchAdMobPlist(app, infoPlist) {
  plist(infoPlist, '-replace', 'GADApplicationIdentifier', '-string', app.ads.appId);
  plist(infoPlist, '-replace', 'SKAdNetworkItems', '-json', JSON.stringify(SKADNETWORK_IDS.map((id) => ({ SKAdNetworkIdentifier: id }))));
  if ('NSUserTrackingUsageDescription' in plistJson(infoPlist)) plist(infoPlist, '-remove', 'NSUserTrackingUsageDescription');
  console.log(`admob: app ${app.ads.appId}, rewarded ${app.ads.rewarded}${app.ads.test ? ' (TEST ads)' : ''}, ${SKADNETWORK_IDS.length} SKAdNetwork ids, no ATT`);
}

/** Capacitor 8 iOS links plugins as Swift packages: cap sync writes them into CapApp-SPM/Package.swift. */
function checkAdMobLinked(app, work) {
  const spm = join(work, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
  const text = existsSync(spm) ? readFileSync(spm, 'utf8') : '';
  if (!text) console.warn(`warning: ${relative(ROOT, spm)} not found (not a Swift Package Manager project?)`);
  const linked = text.includes('CapacitorCommunityAdmob');
  if (app.ads && !linked) fail(`cap sync ios did not add ${ADMOB_PLUGIN} to ${relative(ROOT, spm)}`);
  if (!app.ads && linked) fail(`${ADMOB_PLUGIN} linked into an app without ads`);
  if (app.ads) console.log(`admob: ${ADMOB_PLUGIN}@${app.ads.plugin} in CapApp-SPM`);
}

/** Built app: app id + SKAdNetwork list in Info.plist, no tracking prompt text, the SDK in the binary. */
function verifyAdMob(app, appPath, p) {
  const problems = [];
  const items = (p.SKAdNetworkItems ?? []).map((i) => i?.SKAdNetworkIdentifier);
  if ('NSUserTrackingUsageDescription' in p) problems.push('Info.plist has NSUserTrackingUsageDescription (the app never asks for tracking)');
  const binary = join(appPath, 'App');
  const bin = existsSync(binary) ? readFileSync(binary) : Buffer.alloc(0);
  // the SDK reads this key at start-up, so its name is in a binary that links GoogleMobileAds
  const sdkIn = bin.includes(Buffer.from('GADApplicationIdentifier')) || filesUnder(appPath).some((f) => /GoogleMobileAds/.test(f));
  if (!app.ads) {
    if ('GADApplicationIdentifier' in p || items.length) problems.push('AdMob keys in Info.plist of an app without ads');
    return problems;
  }
  if (p.GADApplicationIdentifier !== app.ads.appId) problems.push(`Info.plist GADApplicationIdentifier = ${JSON.stringify(p.GADApplicationIdentifier)}, want ${app.ads.appId} (store/apps.json)`);
  if (items[0] !== 'cstr6suwn9.skadnetwork') problems.push('SKAdNetworkItems does not start with Google\'s cstr6suwn9.skadnetwork');
  if (items.length !== SKADNETWORK_IDS.length || SKADNETWORK_IDS.some((id) => !items.includes(id))) problems.push(`SKAdNetworkItems has ${items.length} ids, want the ${SKADNETWORK_IDS.length} of tools/admob.mjs`);
  if (!sdkIn) problems.push('Google Mobile Ads SDK not found in the built app');
  if (!bin.includes(Buffer.from('AdMobPlugin'))) console.warn('warning: AdMobPlugin symbol not found in the app binary (check the plugin is linked)');
  return problems;
}

// ---------------------------------------------------------------- build
function xcode(app, work, sign) {
  const proj = join(work, 'ios', 'App', 'App.xcodeproj');
  const dd = join(work, 'dd');
  const common = ['-project', proj, '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-derivedDataPath', dd];
  if (UNSIGNED) {
    step('xcodebuild (unsigned compile check)');
    run('xcodebuild', [...common, 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'build'], { cwd: work });
    return { appPath: join(dd, 'Build', 'Products', 'Release-iphoneos', 'App.app') };
  }
  const auth = ['-allowProvisioningUpdates', '-authenticationKeyPath', sign.key, '-authenticationKeyID', sign.keyId, '-authenticationKeyIssuerID', sign.issuer];
  const archive = join(work, 'App.xcarchive');
  step('xcodebuild archive (automatic signing with the App Store Connect key)');
  run('xcodebuild', [...common, ...auth, '-archivePath', archive, 'archive'], { cwd: work });
  const opts = join(work, 'ExportOptions.plist');
  writeFileSync(
    opts,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>method</key><string>app-store-connect</string>\n<key>destination</key><string>${UPLOAD ? 'upload' : 'export'}</string>\n<key>teamID</key><string>${sign.team}</string>\n<key>signingStyle</key><string>automatic</string>\n<key>uploadSymbols</key><true/>\n<key>manageAppVersionAndBuildNumber</key><false/>\n</dict></plist>\n`,
  );
  step(UPLOAD ? 'export + upload to App Store Connect' : 'export .ipa');
  const exportDir = join(work, 'export');
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', opts, '-exportPath', exportDir, ...auth], { cwd: work });
  return { appPath: join(archive, 'Products', 'Applications', 'App.app'), exportDir };
}

function verify(app, appPath, info) {
  step('verify built app');
  if (!existsSync(appPath)) fail(`built app not found at ${relative(ROOT, appPath)}`);
  const p = plistJson(join(appPath, 'Info.plist'));
  const problems = [];
  // key order does not matter (plutil writes dictionaries sorted)
  const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  const want = (k, v) => canon(p[k]) !== canon(v) && problems.push(`Info.plist ${k} = ${JSON.stringify(p[k])}, want ${JSON.stringify(v)}`);
  want('CFBundleIdentifier', app.bundleId);
  want('CFBundleShortVersionString', app.version);
  want('CFBundleVersion', String(info.build));
  want('UIDeviceFamily', [1]);
  want('UISupportedInterfaceOrientations', ['UIInterfaceOrientationPortrait']);
  want('ITSAppUsesNonExemptEncryption', false);
  want('UIRequiresFullScreen', true);
  if (app.boards) want('GCBoards', app.boards);
  problems.push(...verifyAdMob(app, appPath, p));
  if (!existsSync(join(appPath, 'PrivacyInfo.xcprivacy'))) problems.push('PrivacyInfo.xcprivacy not in the app bundle');
  if (!existsSync(join(appPath, 'Assets.car'))) problems.push('no compiled asset catalog (icon)');
  if (!existsSync(join(appPath, 'public', 'index.html'))) problems.push('web bundle (public/index.html) missing');
  for (const f of filesUnder(appPath)) if (/capacitor\.svg|splash\.png$/i.test(f) && !/Assets\.car/.test(f)) problems.push(`template leftover ${relative(appPath, f)}`);
  if (problems.length) fail(`checks:\n  ${problems.join('\n  ')}`);
  console.log(`ok: ${app.bundleId} ${app.version} (${info.build}), iPhone only, portrait, compliance key, privacy manifest${app.boards ? ', Game Center boards' : ''}${app.ads ? ', AdMob (app id, SKAdNetwork, SDK linked, no ATT)' : ', no ad SDK'}`);
}

// ---------------------------------------------------------------- main
const slug = process.argv[2];
const app = loadApp(slug);
const sign = preflight();
const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown';
const now = new Date();
const build = process.env.OYUN_BUILD_NUMBER ? Number(process.env.OYUN_BUILD_NUMBER) : Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000);
if (!Number.isInteger(build) || build < 1) fail(`bad build number ${process.env.OYUN_BUILD_NUMBER}`);
const info = { build, commit, builtAt: now.toISOString() };
console.log(`${app.slug} → ${app.bundleId} ${app.version} (${build}), commit ${commit}${UNSIGNED ? ', unsigned check' : UPLOAD ? ', upload' : ''}`);
const work = join(OUT_DIR, 'ipa', app.slug);
mkdirSync(work, { recursive: true });
buildWeb(app, work);
capacitor(app, work);
patchNative(app, work, info, sign);
const { appPath, exportDir } = xcode(app, work, sign);
verify(app, appPath, info);
if (exportDir && !UPLOAD) {
  const ipa = readdirSync(exportDir).find((f) => f.endsWith('.ipa'));
  if (!ipa) fail('export produced no .ipa');
  copyFileSync(join(exportDir, ipa), join(OUT_DIR, `${app.slug}-appstore.ipa`));
  console.log(`\nIPA: build/${app.slug}-appstore.ipa`);
}
writeFileSync(join(OUT_DIR, `${app.slug}-ios.json`), `${JSON.stringify({ slug: app.slug, bundleId: app.bundleId, version: app.version, build, commit: info.commit, builtAt: info.builtAt, mode: UNSIGNED ? 'unsigned' : UPLOAD ? 'upload' : 'export' }, null, 2)}\n`);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

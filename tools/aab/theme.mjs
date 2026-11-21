// Full-screen activity themes for every Android build (tools/aab.mjs and tools/apk.mjs).
//
// Capacitor's template (cap add android, 8.6.2) starts MainActivity with
// AppTheme.NoActionBarLaunch, whose parent is androidx core-splashscreen's Theme.SplashScreen.
// On Android 12+ (values-v31) that style chain ends in android:Theme.DeviceDefault.DayNight,
// a platform theme WITH an action bar: the library expects installSplashScreen() to swap in
// postSplashScreenTheme, which Capacitor never calls. BridgeActivity switches to
// AppTheme.NoActionBar inside its onCreate, but anything that creates the window decor earlier
// (our MainActivity's EdgeToEdge.enable() did) bakes the launch theme's action bar into the
// window: the dark strip with the app label above the game. So the themes here say "no action
// bar, no title" themselves, at every level, instead of relying on call order:
//   - AppTheme (application default): NoActionBar parent instead of DarkActionBar;
//   - AppTheme.NoActionBar (what BridgeActivity sets): platform and AppCompat flags off;
//   - AppTheme.NoActionBarLaunch (the launcher/splash theme in the manifest): the same flags,
//     postSplashScreenTheme = AppTheme.NoActionBar;
//   - both activity themes draw into the display cutout (shortEdges, API 27+; MainActivity
//     sets the same at runtime and hides the system bars, see its comments).
// The text is patched (not replaced) so a template change fails the build with a message.

const NO_BAR = ['        <item name="android:windowActionBar">false</item>', '        <item name="android:windowNoTitle">true</item>'];
const CUTOUT = '        <item name="android:windowLayoutInDisplayCutoutMode" tools:targetApi="27">shortEdges</item>';

/** Replace exactly one match of `re`, else throw (template drift). */
function once(text, re, replacement, what) {
  const n = text.match(new RegExp(re.source, `${re.flags.replace('g', '')}g`))?.length ?? 0;
  if (n !== 1) throw new Error(`cannot patch res/values/styles.xml (${what}): expected one match of ${re}, found ${n}`);
  return text.replace(re, replacement);
}

/** Capacitor's res/values/styles.xml → the full-screen version described above. */
export function fullScreenStyles(xml) {
  let x = once(xml, /<resources>/, '<resources xmlns:tools="http://schemas.android.com/tools">', '<resources>');
  x = once(x, /(<style name="AppTheme" parent=")Theme\.AppCompat\.Light\.DarkActionBar(">\n)/, `$1Theme.AppCompat.DayNight.NoActionBar$2${NO_BAR.join('\n')}\n`, 'AppTheme parent');
  x = once(
    x,
    /(<style name="AppTheme\.NoActionBar" parent="Theme\.AppCompat\.DayNight\.NoActionBar">\n)/,
    `$1${[...NO_BAR, CUTOUT].join('\n')}\n`,
    'AppTheme.NoActionBar',
  );
  x = once(
    x,
    /(<style name="AppTheme\.NoActionBarLaunch" parent="Theme\.SplashScreen">\n)/,
    `$1${[...NO_BAR, '        <item name="windowActionBar">false</item>', '        <item name="windowNoTitle">true</item>', CUTOUT, '        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>'].join('\n')}\n`,
    'AppTheme.NoActionBarLaunch',
  );
  return x;
}

// Platform attribute ids (android.R.attr) as `aapt2 dump resources` prints them.
const ATTR = { windowNoTitle: '0x01010056', windowActionBar: '0x010102cd', windowLayoutInDisplayCutoutMode: '0x01010586' };

/**
 * Checks `aapt2 dump resources` output: the given styles must exist, have a NoActionBar /
 * SplashScreen parent, set android:windowActionBar=false and android:windowNoTitle=true, and
 * (activity themes) draw into the cutout. Returns a list of problems (empty = fine) and a
 * one-line summary per style.
 */
export function checkThemeDump(dump, styles) {
  const problems = [];
  const summary = [];
  for (const name of styles) {
    const start = dump.indexOf(` style/${name}\n`);
    if (start < 0) {
      problems.push(`style/${name} not in the resource table`);
      continue;
    }
    const block = dump.slice(start).split('\n').slice(1);
    const end = block.findIndex((l) => /^\s*resource 0x/.test(l));
    const body = block.slice(0, end < 0 ? block.length : end).join('\n');
    const parent = /parent=style\/(\S+)/.exec(body)?.[1] ?? '?';
    // Binary resource tables print "0x01010056=true", proto ones (bundles) "android:windowNoTitle(0x01010056)=true".
    const has = (id, value) => new RegExp(`${id}\\)?=${value}$`, 'm').test(body);
    const facts = {
      parent,
      windowActionBar: has(ATTR.windowActionBar, 'false') ? 'false' : 'unset',
      windowNoTitle: has(ATTR.windowNoTitle, 'true') ? 'true' : 'unset',
    };
    if (!/NoActionBar|SplashScreen/.test(parent)) problems.push(`style/${name} parent is ${parent} (has an action bar)`);
    if (facts.windowActionBar !== 'false') problems.push(`style/${name}: android:windowActionBar is not false`);
    if (facts.windowNoTitle !== 'true') problems.push(`style/${name}: android:windowNoTitle is not true`);
    if (name !== 'AppTheme') {
      // Enum attributes print as their value: shortEdges = 1.
      facts.cutout = has(ATTR.windowLayoutInDisplayCutoutMode, '1') ? 'shortEdges' : 'unset';
      if (facts.cutout !== 'shortEdges') problems.push(`style/${name}: android:windowLayoutInDisplayCutoutMode is not shortEdges`);
    }
    summary.push(`${name} ${JSON.stringify(facts)}`);
  }
  return { problems, summary };
}

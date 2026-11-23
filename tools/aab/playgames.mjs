// Play Games Services v2 manifest patch and merged-manifest check for tools/aab.mjs (pure: string
// in, string out, so tools/aab/playgames.test.mjs can test it without a Gradle build).
//
// Why the init provider goes: play-services-games-v2 (21.0.0, its own AndroidManifest.xml) adds
//   <provider android:name="com.google.android.gms.games.provider.PlayGamesInitProvider"
//             android:authorities="${applicationId}.playgamesinitprovider" .../>
// whose onCreate runs the same initialisation as PlayGamesSdk.initialize() at process start, i.e.
// before the game's age question. Play Games could then sign the player in (or show its profile
// prompt) for a child. Removed with tools:node="remove", the only initialisation left is
// PlayGamesPlugin.init(), which the game calls only after an "adult" answer
// (packages/core/src/online/online.ts). Without the provider the library logs "Please manually
// invoke PlayGamesSdk.initialize()" and waits, which is what we want.
//
// No SUPPRESS_GAME_PROFILE_CREATION meta-data: that key does not occur anywhere in
// play-services-games-v2 21.0.0 (checked in the library's classes), so it is not added.

export const PLAY_GAMES_INIT_PROVIDER = 'com.google.android.gms.games.provider.PlayGamesInitProvider';
const TOOLS_NS = 'xmlns:tools="http://schemas.android.com/tools"';

/** The app's AndroidManifest.xml with Play Games' APP_ID meta-data and the init provider removed. */
export function patchPlayGamesManifest(xml) {
  if (!/<\/application>/.test(xml)) throw new Error('AndroidManifest.xml: no </application>');
  let x = xml.includes('xmlns:tools=') ? xml : xml.replace(/<manifest\b/, `<manifest ${TOOLS_NS}`);
  if (!x.includes(TOOLS_NS)) throw new Error('AndroidManifest.xml: could not declare the tools namespace');
  return x.replace(
    /<\/application>/,
    [
      '    <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/pgs_app_id" />',
      '        <!-- tools/aab/playgames.mjs: no Play Games start at app launch, only after the age answer -->',
      `        <provider android:name="${PLAY_GAMES_INIT_PROVIDER}" android:authorities="\${applicationId}.playgamesinitprovider" tools:node="remove" />`,
      '    </application>',
    ].join('\n'),
  );
}

/** Problems in the merged release manifest of an app with (pgs = true) or without Play Games. */
export function checkMergedPlayGames(xml, pgs) {
  const problems = [];
  const meta = /android:name="com\.google\.android\.gms\.games\.APP_ID"/.test(xml);
  if (pgs !== meta) problems.push(pgs ? 'Play Games APP_ID meta-data missing' : 'Play Games APP_ID meta-data present without a playGames block');
  if (xml.includes(PLAY_GAMES_INIT_PROVIDER)) problems.push(`${PLAY_GAMES_INIT_PROVIDER} is in the merged manifest (it starts Play Games at launch, before the age question)`);
  return problems;
}

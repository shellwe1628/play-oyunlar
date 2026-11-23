// node --test tools/aab/playgames.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkMergedPlayGames, patchPlayGamesManifest, PLAY_GAMES_INIT_PROVIDER } from './playgames.mjs';

// the shape of Capacitor 8's android/app/src/main/AndroidManifest.xml
const SOURCE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="false"
        android:theme="@style/AppTheme">

        <activity android:name=".MainActivity" android:exported="true" />
    </application>

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;

test('declares the tools namespace once and removes the init provider', () => {
  const x = patchPlayGamesManifest(SOURCE);
  assert.equal(x.match(/xmlns:tools="http:\/\/schemas\.android\.com\/tools"/g)?.length, 1);
  const provider = /<provider\b[^>]*>/.exec(x)?.[0] ?? '';
  assert.match(provider, new RegExp(`android:name="${PLAY_GAMES_INIT_PROVIDER.replace(/\./g, '\\.')}"`));
  assert.match(provider, /android:authorities="\$\{applicationId\}\.playgamesinitprovider"/);
  assert.match(provider, /tools:node="remove"/);
  assert.match(x, /<meta-data android:name="com\.google\.android\.gms\.games\.APP_ID" android:value="@string\/pgs_app_id" \/>/);
  // both inside <application>
  assert.ok(x.indexOf('<provider') > x.indexOf('<application') && x.indexOf('<provider') < x.indexOf('</application>'));
  assert.doesNotMatch(x, /SUPPRESS_GAME_PROFILE_CREATION/);
});

test('keeps an existing tools namespace', () => {
  const withNs = SOURCE.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ');
  assert.equal(patchPlayGamesManifest(withNs).match(/xmlns:tools=/g)?.length, 1);
});

test('the merged-manifest check fails when the provider survived the merge', () => {
  const merged = (extra) => `<manifest package="a.b"><application>
    <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="123" />${extra}
  </application></manifest>`;
  assert.deepEqual(checkMergedPlayGames(merged(''), true), []);
  const bad = checkMergedPlayGames(merged(`<provider android:name="${PLAY_GAMES_INIT_PROVIDER}" android:authorities="a.b.playgamesinitprovider" />`), true);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /PlayGamesInitProvider/);
  assert.match(checkMergedPlayGames('<manifest><application/></manifest>', true)[0], /APP_ID meta-data missing/);
  assert.match(checkMergedPlayGames(merged(''), false)[0], /without a playGames block/);
});

package __PACKAGE__;

import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Play Oyunlar TEST APKs (written by tools/apk.mjs from apps/test-paketi/native/MainActivity.java;
 * do not edit the copy under build/test-apk/). One file for both kinds of test app:
 *
 * HAS_LAUNCHER = true — the bundle (launcher + every game). Capacitor's BridgeActivity (8.6.2)
 * registers no back handling, so without this the system default leaves the app from every page:
 *   - on a game page (https://localhost/<slug>/...): back in the WebView history to the launcher,
 *     or load the launcher if there is no history;
 *   - on the launcher (https://localhost/ or /index.html): finish the activity (exit).
 * A game's own "quit to menu" is a Phaser scene change, not a page navigation, so it stays in
 * the game.
 *
 * HAS_LAUNCHER = false — one game per app, same behaviour as the Play build (tools/aab/): the
 * first press shows "Press back again to leave", a second press within 2 s moves the app to the
 * background like Home (the run is kept, the game pauses on visibilitychange).
 *
 * Both register TestUpdatePlugin (in-app update from the GitHub test release; test builds only).
 */
public class MainActivity extends BridgeActivity {

    private static final boolean HAS_LAUNCHER = __HAS_LAUNCHER__;
    private static final long CONFIRM_WINDOW_MS = 2000;
    private long lastBackAt = 0;
    private Toast hint;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before BridgeActivity.onCreate builds the bridge.
        registerPlugin(TestUpdatePlugin.class);
        // Draw behind the status and navigation bars on every Android version (Android 15+ with
        // target SDK 35+ does this anyway). Capacitor's SystemBars plugin then hands the insets
        // to the page as env(safe-area-inset-*), which the launcher and every game respect.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (HAS_LAUNCHER) backInBundle();
                else backInGame();
            }
        });
    }

    private void backInBundle() {
        WebView web = bridge == null ? null : bridge.getWebView();
        if (web == null || isLauncher(web.getUrl())) {
            finish();
            return;
        }
        if (web.canGoBack()) {
            web.goBack();
        } else {
            web.loadUrl(bridge.getAppUrl());
        }
    }

    private void backInGame() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastBackAt <= CONFIRM_WINDOW_MS) {
            lastBackAt = 0;
            if (hint != null) hint.cancel();
            moveTaskToBack(true);
            return;
        }
        lastBackAt = now;
        if (hint != null) hint.cancel();
        hint = Toast.makeText(this, R.string.back_again_to_leave, Toast.LENGTH_SHORT);
        hint.show();
    }

    /** The launcher is the root page; every game lives in its own folder. */
    static boolean isLauncher(String url) {
        if (url == null) return true;
        String path = Uri.parse(url).getPath();
        return path == null || path.isEmpty() || path.equals("/") || path.equals("/index.html");
    }
}

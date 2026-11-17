package __PACKAGE__;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Play Oyunlar test APK (written by tools/apk.mjs from apps/test-paketi/native/MainActivity.java;
 * do not edit the copy under android/).
 *
 * Back button: Capacitor's BridgeActivity (8.6.2) registers no back handling, so without this the
 * system default runs and leaves the app from every page. Here:
 *   - on a game page (https://localhost/<slug>/...): go back in the WebView history to the
 *     launcher, or load the launcher if there is no history;
 *   - on the launcher (https://localhost/ or /index.html): finish the activity (exit).
 * A game's own "quit to menu" is a Phaser scene change, not a page navigation, so it stays in
 * the game.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the status and navigation bars on every Android version (Android 15+ with
        // target SDK 35+ does this anyway). Capacitor's SystemBars plugin then hands the insets
        // to the page as env(safe-area-inset-*), which the launcher and every game respect.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
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
        });
    }

    /** The launcher is the root page; every game lives in its own folder. */
    static boolean isLauncher(String url) {
        if (url == null) return true;
        String path = Uri.parse(url).getPath();
        return path == null || path.isEmpty() || path.equals("/") || path.equals("/index.html");
    }
}

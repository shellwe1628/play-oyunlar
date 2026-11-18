package __PACKAGE__;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Toast;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
 * Both register TestUpdatePlugin (in-app update from the GitHub test release; test builds only),
 * and both run full screen like the Play build: no action bar, sticky immersive (status and
 * navigation bars hidden, back for a moment on an edge swipe), drawn into the display cutout.
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
        // The real theme BEFORE anything touches the window: the manifest's launch theme
        // (Theme.SplashScreen) has a platform action bar on Android 12+, and EdgeToEdge.enable
        // below creates the window decor, so without this the decor kept that action bar (the
        // dark strip with the app label). res/values/styles.xml (tools/aab/theme.mjs) also
        // takes the bar out of every theme. BridgeActivity sets the same theme again.
        setTheme(R.style.AppTheme_NoActionBar);
        // Draw behind the status and navigation bars on every Android version (Android 15+ with
        // target SDK 35+ does this anyway). Capacitor's SystemBars plugin then hands the insets
        // to the page as env(safe-area-inset-*), which the launcher and every game respect.
        EdgeToEdge.enable(this);
        // Into the display cutout too (EdgeToEdge picks ALWAYS on Android 11+; the games are
        // portrait, so short edges = the notch at the top). The cutout stays in the insets the
        // page gets, so HUDs keep clear of it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        super.onCreate(savedInstanceState);
        hideSystemBars();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (HAS_LAUNCHER) backInBundle();
                else backInGame();
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Dialogs (the installer, permission screens), the keyboard and the notification shade
        // can bring the bars back; hide them again whenever the game window has focus.
        if (hasFocus) hideSystemBars();
    }

    /**
     * Sticky immersive: no status bar, no navigation bar. A swipe from the edge shows them for a
     * moment over the game (they do not resize the page) and they hide again by themselves.
     */
    private void hideSystemBars() {
        Window window = getWindow();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
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

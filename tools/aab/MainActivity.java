package __PACKAGE__;

import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
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
 * One game per app (written by tools/aab.mjs from tools/aab/MainActivity.java; do not edit the
 * generated copy under build/aab/).
 *
 * Back button: Capacitor's BridgeActivity (8.6.2) registers no back handling, and the game is a
 * single page whose menus are Phaser scenes, so the system default would leave the app on the
 * first press, in the middle of a run. Here:
 *   - first press: a short toast "Press back again to leave" (values/strings.xml, values-tr/);
 *   - second press within 2 s: moveTaskToBack(true). The app goes to the background exactly
 *     like the Home button: the activity and the WebView are kept, the page gets
 *     visibilitychange, the core pauses the game (audio off, pause menu in scenes that use it)
 *     and the run is still there when the player comes back. Nothing is finished or reloaded.
 * The game's own buttons (pause, menu, quit) stay the way to leave a run inside the game.
 *
 * Full screen: no action bar, sticky immersive (status and navigation bars hidden, back for a
 * moment on an edge swipe), drawn into the display cutout.
 */
public class MainActivity extends BridgeActivity {

    private static final long CONFIRM_WINDOW_MS = 2000;
    private long lastBackAt = 0;
    private Toast hint;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The real theme BEFORE anything touches the window: the manifest's launch theme
        // (Theme.SplashScreen) has a platform action bar on Android 12+, and EdgeToEdge.enable
        // below creates the window decor, so without this the decor kept that action bar (the
        // dark strip with the app label). res/values/styles.xml (tools/aab/theme.mjs) also
        // takes the bar out of every theme. BridgeActivity sets the same theme again.
        setTheme(R.style.AppTheme_NoActionBar);
        // Draw behind the status and navigation bars on every Android version (Android 15+ with
        // target SDK 35+ does this anyway). Capacitor's SystemBars plugin hands the insets to the
        // page as env(safe-area-inset-*), which every game respects.
        EdgeToEdge.enable(this);
        // Into the display cutout too (EdgeToEdge picks ALWAYS on Android 11+; the games are
        // portrait, so short edges = the notch at the top). The cutout stays in the insets the
        // page gets, so HUDs keep clear of it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        // Local Capacitor plugins (tools/aab.mjs fills this in: PlayGamesPlugin for apps with a
        // playGames block in store/apps.json). Must come before super.onCreate.
        /*__PLUGINS__*/
        super.onCreate(savedInstanceState);
        hideSystemBars();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                long now = SystemClock.elapsedRealtime();
                if (now - lastBackAt <= CONFIRM_WINDOW_MS) {
                    lastBackAt = 0;
                    if (hint != null) hint.cancel();
                    moveTaskToBack(true);
                    return;
                }
                lastBackAt = now;
                if (hint != null) hint.cancel();
                hint = Toast.makeText(MainActivity.this, R.string.back_again_to_leave, Toast.LENGTH_SHORT);
                hint.show();
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
        // Dialogs, the keyboard and the notification shade can bring the bars back; hide them
        // again whenever the game window has focus.
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
}

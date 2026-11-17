package __PACKAGE__;

import android.os.Bundle;
import android.os.SystemClock;
import android.widget.Toast;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
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
 */
public class MainActivity extends BridgeActivity {

    private static final long CONFIRM_WINDOW_MS = 2000;
    private long lastBackAt = 0;
    private Toast hint;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the status and navigation bars on every Android version (Android 15+ with
        // target SDK 35+ does this anyway). Capacitor's SystemBars plugin hands the insets to the
        // page as env(safe-area-inset-*), which every game respects.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
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
}

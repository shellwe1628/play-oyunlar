package __PACKAGE__;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.leaderboard.LeaderboardScore;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.tasks.Task;

/**
 * Google Play Games Services v2 leaderboards for the web game (Capacitor plugin "PlayGames").
 * Copied by tools/aab.mjs only into apps whose store/apps.json entry has a `playGames` block; do
 * not edit the generated copy under build/aab/. JS side: packages/core/src/online/online.ts.
 *
 * Nothing here runs on its own. PlayGamesSdk.initialize (which is what makes Play Games try the
 * automatic sign-in) is called only from init(), and the game calls init() only after the
 * player's age answer says 13 or older. Children are never initialised, signed in or scored.
 * The library's own PlayGamesInitProvider (which would run the same initialisation at app launch)
 * is removed from the merged manifest by tools/aab/playgames.mjs, and tools/aab.mjs fails the
 * build if it is back.
 *
 * Board ids: the game uses logical ids ("best", "endless"); string resource pgs_board_<id>
 * (res/values/pgs.xml, written from store/apps.json) holds the Console's leaderboard id.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final int RC_LEADERBOARD = 9004;
    private boolean initialised = false;

    private String str(String name) {
        int id = getContext().getResources().getIdentifier(name, "string", getContext().getPackageName());
        if (id == 0) return null;
        String v = getContext().getString(id);
        return v == null || v.trim().isEmpty() ? null : v.trim();
    }

    private String board(PluginCall call) {
        String logical = call.getString("board");
        if (logical == null || !logical.matches("[a-z][a-z0-9_]*")) {
            call.reject("bad board id");
            return null;
        }
        String id = str("pgs_board_" + logical);
        if (id == null) call.reject("board not configured: " + logical);
        return id;
    }

    private boolean ready(PluginCall call) {
        if (!initialised) {
            call.reject("not initialised");
            return false;
        }
        if (getActivity() == null) {
            call.reject("no activity");
            return false;
        }
        return true;
    }

    /** Resolves {signedIn, name?} from an authentication task. */
    private void answer(PluginCall call, Task<AuthenticationResult> auth) {
        auth.addOnCompleteListener(t -> {
            boolean ok = t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated();
            if (!ok) {
                JSObject r = new JSObject();
                r.put("signedIn", false);
                call.resolve(r);
                return;
            }
            PlayGames.getPlayersClient(getActivity()).getCurrentPlayer().addOnCompleteListener(p -> {
                JSObject r = new JSObject();
                r.put("signedIn", true);
                if (p.isSuccessful() && p.getResult() != null) r.put("name", p.getResult().getDisplayName());
                call.resolve(r);
            });
        });
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", str("pgs_app_id") != null);
        call.resolve(r);
    }

    @PluginMethod
    public void init(PluginCall call) {
        if (str("pgs_app_id") == null || getActivity() == null) {
            call.reject("Play Games is not configured");
            return;
        }
        if (!initialised) {
            PlayGamesSdk.initialize(getContext());
            initialised = true;
        }
        answer(call, PlayGames.getGamesSignInClient(getActivity()).isAuthenticated());
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!ready(call)) return;
        answer(call, PlayGames.getGamesSignInClient(getActivity()).signIn());
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        if (!ready(call)) return;
        String id = board(call);
        if (id == null) return;
        Double score = call.getDouble("score");
        if (score == null || score < 0) {
            call.reject("bad score");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity())
            .submitScoreImmediate(id, (long) Math.floor(score))
            .addOnCompleteListener(t -> {
                if (t.isSuccessful()) call.resolve();
                else call.reject("submit failed");
            });
    }

    @PluginMethod
    public void showBoard(PluginCall call) {
        if (!ready(call)) return;
        String id = board(call);
        if (id == null) return;
        PlayGames.getLeaderboardsClient(getActivity()).getLeaderboardIntent(id).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null) {
                call.reject("no leaderboard screen");
                return;
            }
            Intent intent = t.getResult();
            getActivity().startActivityForResult(intent, RC_LEADERBOARD);
            call.resolve();
        });
    }

    @PluginMethod
    public void loadMine(PluginCall call) {
        if (!ready(call)) return;
        String id = board(call);
        if (id == null) return;
        PlayGames.getLeaderboardsClient(getActivity())
            .loadCurrentPlayerLeaderboardScore(id, LeaderboardVariant.TIME_SPAN_ALL_TIME, LeaderboardVariant.COLLECTION_PUBLIC)
            .addOnCompleteListener(t -> {
                JSObject r = new JSObject();
                LeaderboardScore s = t.isSuccessful() && t.getResult() != null ? t.getResult().get() : null;
                if (s != null) {
                    r.put("score", s.getRawScore());
                    if (s.getRank() > 0) r.put("rank", s.getRank());
                    r.put("display", s.getDisplayScore());
                }
                call.resolve(r);
            });
    }
}

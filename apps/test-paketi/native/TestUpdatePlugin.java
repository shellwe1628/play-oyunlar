package __PACKAGE__;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * TEST BUILDS ONLY: in-app update from the rolling GitHub test release.
 * Written by tools/apk.mjs from apps/test-paketi/native/TestUpdatePlugin.java (do not edit the
 * generated copy); tools/aab.mjs (Google Play) never uses it.
 *
 * JavaScript (apps/test-paketi/src/update/) decides what to show; this class does only what a
 * WebView cannot: HTTP to GitHub (redirects to another host, no CORS headers), streaming a
 * multi-megabyte file to disk with SHA-256, the "Install unknown apps" setting, and handing the
 * APK to Android's package installer through a FileProvider content URI. Android always shows
 * its own confirmation; nothing installs without the user's taps.
 *
 * Only RELEASE_BASE is ever fetched: JavaScript passes a file name (checked against FILE), never
 * a URL. Rejection codes (see src/update/machine.ts): NETWORK, INTERRUPTED, HTTP, SIZE, CHECKSUM,
 * STORAGE, BAD_REQUEST, MISSING.
 */
@CapacitorPlugin(name = "TestUpdate")
public class TestUpdatePlugin extends Plugin {

    /** https://github.com/<owner>/<repo>/releases/download/<tag>/ — filled in by tools/apk.mjs. */
    static final String RELEASE_BASE = "__RELEASE_BASE__";
    static final String MANIFEST = "versions.json";
    private static final Pattern FILE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.apk$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");
    private static final int MAX_MANIFEST_BYTES = 256 * 1024;
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    private static final String AUTHORITY_SUFFIX = ".testupdate";

    /** Downloads one at a time (a second tap waits and then finds the verified file). */
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final ExecutorService small = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : versionCodeLegacy(p);
            JSObject r = new JSObject();
            r.put("applicationId", getContext().getPackageName());
            r.put("versionCode", code);
            r.put("versionName", p.versionName);
            r.put("sdk", Build.VERSION.SDK_INT);
            call.resolve(r);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("own package not found", "MISSING");
        }
        downloads.execute(this::removeOldFiles);
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeLegacy(PackageInfo p) {
        return p.versionCode;
    }

    @PluginMethod
    public void check(PluginCall call) {
        small.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = open(RELEASE_BASE + MANIFEST);
                int status = c.getResponseCode();
                JSObject r = new JSObject();
                r.put("status", status);
                r.put("body", status == 200 ? readLimited(c.getInputStream(), MAX_MANIFEST_BYTES) : "");
                call.resolve(r);
            } catch (IOException e) {
                call.reject("manifest not reachable: " + e.getClass().getSimpleName(), "NETWORK");
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("canInstall", canRequestInstalls());
        call.resolve(r);
    }

    /** API 26+: per-app "Install unknown apps". API 24-25: the installer itself asks for the global setting. */
    private boolean canRequestInstalls() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) {
            canInstall(call);
            return;
        }
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        try {
            startActivityForResult(call, i, "settingsReturned");
        } catch (ActivityNotFoundException e) {
            canInstall(call);
        }
    }

    @ActivityCallback
    private void settingsReturned(PluginCall call, ActivityResult result) {
        // The settings screen returns no meaningful result code: ask the package manager.
        if (call == null) return;
        canInstall(call);
        bridge.releaseCall(call); // saved by startActivityForResult
    }

    @PluginMethod
    public void download(PluginCall call) {
        String file = call.getString("file", "");
        String sha = call.getString("sha256", "");
        // getLong() returns null for values that fit an int: read the JSON number directly.
        long size = call.getData().optLong("size", -1);
        if (!FILE.matcher(file).matches() || !SHA256.matcher(sha).matches() || size <= 0 || size > MAX_APK_BYTES) {
            call.reject("bad download request", "BAD_REQUEST");
            return;
        }
        downloads.execute(() -> fetchApk(call, file, size, sha));
    }

    private void fetchApk(PluginCall call, String file, long size, String sha) {
        File dir = updateDir();
        File out = new File(dir, file);
        try {
            if (out.isFile() && out.length() == size && sha.equals(sha256(out))) {
                progress(size, size);
                done(call, size, sha);
                return;
            }
        } catch (IOException ignored) {
            // re-download below
        }
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        if (dir.getUsableSpace() < size + 10L * 1024 * 1024) {
            call.reject("not enough space", "STORAGE");
            return;
        }
        File part = new File(dir, file + ".part");
        HttpURLConnection c = null;
        long received = 0;
        try {
            c = open(RELEASE_BASE + file);
            int status = c.getResponseCode();
            if (status != 200) {
                call.reject("HTTP " + status, "HTTP");
                return;
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            long lastNotify = 0;
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    received += n;
                    if (received > size) {
                        part.delete();
                        call.reject("larger than the manifest says", "SIZE");
                        return;
                    }
                    md.update(buf, 0, n);
                    os.write(buf, 0, n);
                    long now = System.currentTimeMillis();
                    if (now - lastNotify > 150) {
                        lastNotify = now;
                        progress(received, size);
                    }
                }
            }
            progress(received, size);
            if (received != size) {
                part.delete();
                call.reject("got " + received + " of " + size + " bytes", "SIZE");
                return;
            }
            String got = hex(md.digest());
            if (!got.equals(sha)) {
                part.delete();
                call.reject("SHA-256 mismatch", "CHECKSUM");
                return;
            }
            if (!part.renameTo(out)) {
                part.delete();
                call.reject("cannot store the file", "STORAGE");
                return;
            }
            done(call, received, got);
        } catch (IOException e) {
            part.delete();
            call.reject("download failed: " + e.getClass().getSimpleName(), received > 0 ? "INTERRUPTED" : "NETWORK");
        } catch (NoSuchAlgorithmException e) {
            call.reject("no SHA-256", "CHECKSUM");
        } finally {
            if (c != null) c.disconnect();
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String file = call.getString("file", "");
        String sha = call.getString("sha256", "");
        if (!FILE.matcher(file).matches() || !SHA256.matcher(sha).matches()) {
            call.reject("bad install request", "BAD_REQUEST");
            return;
        }
        File apk = new File(updateDir(), file);
        downloads.execute(() -> {
            // Re-check right before the hand-off: only the verified bytes reach the installer.
            try {
                if (!apk.isFile() || !sha.equals(sha256(apk))) {
                    call.reject("file missing or changed", "CHECKSUM");
                    return;
                }
            } catch (IOException e) {
                call.reject("cannot read the file", "MISSING");
                return;
            }
            getActivity().runOnUiThread(() -> launchInstaller(call, apk));
        });
    }

    @SuppressWarnings("deprecation") // ACTION_INSTALL_PACKAGE: deprecated in API 29, still the way to get a result back
    private void launchInstaller(PluginCall call, File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + AUTHORITY_SUFFIX, apk);
        Intent i = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.putExtra(Intent.EXTRA_RETURN_RESULT, true);
        try {
            startActivityForResult(call, i, "installReturned");
        } catch (ActivityNotFoundException e) {
            call.reject("no package installer", "INSTALL");
        }
    }

    /** Only reached when the user backs out or the install fails: a successful update restarts the app. */
    @ActivityCallback
    private void installReturned(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        int code = result.getResultCode();
        r.put("result", code == android.app.Activity.RESULT_OK ? "installed" : code == android.app.Activity.RESULT_CANCELED ? "cancelled" : "failed");
        call.resolve(r);
        bridge.releaseCall(call); // saved by startActivityForResult
    }

    // ---------------------------------------------------------------- helpers

    private File updateDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    /** Leftovers of earlier updates (the installed APK's own file, interrupted parts). */
    private void removeOldFiles() {
        File[] files = updateDir().listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - 60L * 60 * 1000;
        for (File f : files) if (f.lastModified() < cutoff) f.delete();
    }

    private void progress(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private static void done(PluginCall call, long bytes, String sha) {
        JSObject r = new JSObject();
        r.put("bytes", bytes);
        r.put("sha256", sha);
        call.resolve(r);
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true); // github.com → *.githubusercontent.com, both https
        c.setUseCaches(false);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Cache-Control", "no-cache");
        c.setRequestProperty("Accept", "*/*");
        return c;
    }

    private static String readLimited(InputStream in, int max) throws IOException {
        try (InputStream s = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = s.read(buf)) != -1) {
                if (out.size() + n > max) throw new IOException("manifest too large");
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String sha256(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
            return hex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format(Locale.ROOT, "%02x", x));
        return s.toString();
    }
}

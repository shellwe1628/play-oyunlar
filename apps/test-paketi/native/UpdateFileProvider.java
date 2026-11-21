package __PACKAGE__;

import androidx.core.content.FileProvider;

/**
 * TEST BUILDS ONLY (tools/apk.mjs): shares the downloaded update APK with Android's package
 * installer as a content:// URI. Authority <applicationId>.testupdate, paths in
 * res/xml/test_update_paths.xml (only the cache folder "updates/"). Its own subclass so it never
 * clashes with Capacitor's FileProvider entry in the manifest.
 */
public class UpdateFileProvider extends FileProvider {}

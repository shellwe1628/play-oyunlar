#!/usr/bin/env bash
# Publish the test APKs of one build to the rolling GitHub pre-release (tag $TAG, default
# test-latest). Called by .github/workflows/test-apk.yml (job `publish`); needs `gh` with
# GH_TOKEN (contents: write) and GH_REPO, and GITHUB_SHA (the commit that was built).
#   bash tools/test-apk/publish.sh <dir with versions.json and the APKs it lists>
# Order matters for phones that check while this runs:
#   1. upload the new APKs (new names: <name>-<versionCode>.apk, nothing is overwritten);
#   2. upload versions.json (from now on phones see the new versions);
#   3. delete APKs that neither the new nor the previous manifest lists (a phone that read the
#      previous manifest a moment ago can still finish its download).
set -euo pipefail

DIR=${1:?usage: publish.sh <dir>}
TAG=${TAG:-test-latest}
die() { echo "::error::$*"; exit 1; }
: "${GH_REPO:?GH_REPO (owner/repo) is not set}"
: "${GITHUB_SHA:?GITHUB_SHA is not set}"
MANIFEST="$DIR/versions.json"
[ -f "$MANIFEST" ] || die "$MANIFEST missing: the build job did not produce a manifest"

# Files the manifest lists, each checked against its size and SHA-256 before anything is uploaded.
mapfile -t ROWS < <(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const a of m.apps) console.log([a.file, a.size, a.sha256].join(" "));
' "$MANIFEST")
[ "${#ROWS[@]}" -gt 0 ] || die "versions.json lists no apps"
FILES=()
for row in "${ROWS[@]}"; do
  read -r file size sha <<<"$row"
  [[ "$file" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$ ]] || die "bad file name in versions.json: $file"
  [ -f "$DIR/$file" ] || die "$file is listed in versions.json but missing from the build artifact"
  [ "$(stat -c %s "$DIR/$file")" = "$size" ] || die "$file: size differs from versions.json"
  [ "$(sha256sum "$DIR/$file" | cut -d' ' -f1)" = "$sha" ] || die "$file: SHA-256 differs from versions.json"
  FILES+=("$file")
done
echo "manifest ok: ${FILES[*]}"

PREV=$(mktemp -d)
trap 'rm -rf "$PREV"' EXIT
if gh release view "$TAG" > /dev/null 2>&1; then
  echo "release $TAG exists"
  gh release download "$TAG" --pattern versions.json --dir "$PREV" --clobber || echo "no previous versions.json on the release"
else
  echo "creating pre-release $TAG at $GITHUB_SHA"
  gh release create "$TAG" --prerelease --target "$GITHUB_SHA" --title "Test APK'ları" --notes "Hazırlanıyor…" \
    || die "could not create the release $TAG (does the token have contents: write?)"
fi

# The tag follows the newest build (lightweight tag; force-moved).
gh api --method PATCH "repos/$GH_REPO/git/refs/tags/$TAG" -f sha="$GITHUB_SHA" -F force=true > /dev/null \
  || die "could not move tag $TAG to $GITHUB_SHA"

UPLOAD=()
for f in "${FILES[@]}"; do UPLOAD+=("$DIR/$f"); done
gh release upload "$TAG" "${UPLOAD[@]}" --clobber || die "uploading the APKs failed (the manifest was NOT changed; phones keep the previous version)"
gh release upload "$TAG" "$MANIFEST" --clobber || die "uploading versions.json failed (APKs are uploaded; re-run the workflow)"
echo "uploaded ${#FILES[@]} APKs and versions.json"

KEEP=("versions.json" "${FILES[@]}")
if [ -f "$PREV/versions.json" ]; then
  mapfile -t OLD < <(node -e 'for (const a of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).apps ?? []) console.log(a.file)' "$PREV/versions.json" || true)
  KEEP+=("${OLD[@]}")
fi
mapfile -t ASSETS < <(gh release view "$TAG" --json assets --jq '.assets[].name')
for name in "${ASSETS[@]}"; do
  keep=no
  for k in "${KEEP[@]}"; do [ "$name" = "$k" ] && keep=yes && break; done
  if [ "$keep" = no ]; then
    echo "deleting stale asset $name"
    gh release delete-asset "$TAG" "$name" --yes || echo "::warning::could not delete $name (harmless; it is no longer listed)"
  fi
done

node "$(dirname "$0")/release.mjs" notes "$MANIFEST" > "$PREV/notes.md"
gh release edit "$TAG" --prerelease --title "Test APK'ları ($(date -u +%Y-%m-%d\ %H:%M) UTC)" --notes-file "$PREV/notes.md" \
  || die "could not update the release notes (APKs and manifest are already published)"
echo "published: https://github.com/$GH_REPO/releases/tag/$TAG"

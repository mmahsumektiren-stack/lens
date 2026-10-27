#!/usr/bin/env bash
# Lens Seçim APK'sını Android SDK araçlarıyla doğrudan derler (Gradle yok).
# Derleme: GitHub Actions (.github/workflows/android.yml)
# Gerekenler: ANDROID_HOME (build-tools + platforms), JDK 17, KS_FILE / KS_PASS (imza anahtarı).
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || { echo "ANDROID_HOME yok"; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
PLAT="$(ls "$SDK/platforms" | grep -E '^android-[0-9]+$' | sort -t- -k2 -n | tail -1)"
AJ="$SDK/platforms/$PLAT/android.jar"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
echo "build-tools: $BT"
echo "platform:    $PLAT"

rm -rf build && mkdir -p build/gen build/classes build/dex build/assets

# Test sürümü (LENS_DEV=1): ayrı paket adı (asıl uygulamanın yanına kurulur), "Lens Test" adları, test kopyasını açar
PKG=io.github.mmahsumektiren.lens
BASE_URL="https://mmahsumektiren-stack.github.io/lens/"
RES=res
OUT=lens-secim.apk
EXTRA=()
if [ "${LENS_DEV:-0}" = "1" ]; then
  BASE_URL="${BASE_URL}dev/"
  OUT=lens-secim-test.apk
  RES=build/res-dev
  cp -r res "$RES"
  sed -i -e 's|<string name="app_name">[^<]*</string>|<string name="app_name">Lens Test Seçim</string>|' \
         -e 's|<string name="menu_label">[^<]*</string>|<string name="menu_label">Lens Test</string>|' \
         -e 's|<string name="tile_label">[^<]*</string>|<string name="tile_label">Lens Test</string>|' \
         -e 's|<string name="share_label">[^<]*</string>|<string name="share_label">Lens Test</string>|' "$RES/values/strings.xml"
  EXTRA=(--rename-manifest-package "$PKG.dev")
fi
mkdir -p "build/gen/${PKG//.//}"
cat > "build/gen/${PKG//.//}/Config.java" <<JAVA
package $PKG;
/** build.sh üretir. */
final class Config {
    static final String BASE = "$BASE_URL";
    static final boolean DEV = ${LENS_DEV:-0} == 1;
    private Config() {}
}
JAVA
# sayfa sadeleştirici (Readability), PWA ile aynı dosya
cp ../readability.js build/assets/readability.js

"$BT/aapt2" compile --dir "$RES" -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$AJ" --manifest AndroidManifest.xml build/res.zip -A build/assets \
  --java build/gen --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "${EXTRA[@]}"

javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$AJ" -d build/classes \
  $(find src build/gen -name '*.java')

"$BT/d8" --release --min-api 26 --lib "$AJ" --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q -u ../base.apk classes.dex)

"$BT/zipalign" -f -p 4 build/base.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KS_FILE" --ks-pass env:KS_PASS --key-pass env:KS_PASS --ks-key-alias lens \
  --out "build/$OUT" build/aligned.apk
"$BT/apksigner" verify --print-certs "build/$OUT" | head -3
ls -la "build/$OUT"

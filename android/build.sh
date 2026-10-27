#!/usr/bin/env bash
# Lens Seçim APK'sını Android SDK araçlarıyla doğrudan derler (Gradle yok).
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

rm -rf build && mkdir -p build/gen build/classes build/dex

"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$AJ" --manifest AndroidManifest.xml -R build/res.zip \
  --java build/gen --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$AJ" -d build/classes \
  $(find src build/gen -name '*.java')

"$BT/d8" --release --min-api 26 --lib "$AJ" --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q -u ../base.apk classes.dex)

"$BT/zipalign" -f -p 4 build/base.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KS_FILE" --ks-pass env:KS_PASS --key-pass env:KS_PASS --ks-key-alias lens \
  --out build/lens-secim.apk build/aligned.apk
"$BT/apksigner" verify --print-certs build/lens-secim.apk | head -3
ls -la build/lens-secim.apk

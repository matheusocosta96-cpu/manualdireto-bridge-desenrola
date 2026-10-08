#!/usr/bin/env bash
# Gera um APK assinado sem Gradle e sem o SDK do Google.
# Uso: tools/build-apk.sh [debug|release]
#
# Pré-requisitos: tools/fetch-build-tools.sh e os pacotes aapt, apksigner e
# zipalign. O caminho normal continua sendo o Android Studio (pasta android/);
# este script existe para ambientes sem acesso ao SDK.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/android/app"
TOOLS="$ROOT/android/.buildtools"
BUILD="$ROOT/android/build"
ANDROID_JAR="$TOOLS/android-35.jar"
ANDROID_RES_JAR="$TOOLS/android-34.jar"
DX="$TOOLS/dx.jar"
VARIANT="${1:-release}"

KEYSTORE="${TRAJETORIA_KEYSTORE:-$ROOT/android/keystore/trajetoria.jks}"
KEY_ALIAS="${TRAJETORIA_KEY_ALIAS:-trajetoria}"
KEY_PASS_FILE="${TRAJETORIA_KEY_PASS_FILE:-$ROOT/android/keystore/password.txt}"

for jar in "$ANDROID_JAR" "$ANDROID_RES_JAR"; do
  [ -f "$jar" ] || { echo "Rode tools/fetch-build-tools.sh primeiro."; exit 1; }
done
[ -f "$DX" ] || { echo "Rode tools/fetch-build-tools.sh primeiro."; exit 1; }

# shellcheck disable=SC2046
eval $(grep -E '^(versionCode|versionName)=' "$ROOT/android/version.properties" | sed 's/^/export /')

echo "== 1/7 assets da interface"
( cd "$ROOT" && node build.mjs )

echo "== 2/7 preparando diretórios"
rm -rf "$BUILD"
mkdir -p "$BUILD/res" "$BUILD/gen" "$BUILD/classes" "$BUILD/apk"

cat > "$BUILD/gen/BuildInfo.java" <<JAVA
package br.pessoal.trajetoria;

final class BuildInfo {
    static final String VERSION_NAME = "$versionName";
    static final int VERSION_CODE = $versionCode;
    private BuildInfo() { }
}
JAVA
mkdir -p "$BUILD/gen/br/pessoal/trajetoria"
mv "$BUILD/gen/BuildInfo.java" "$BUILD/gen/br/pessoal/trajetoria/BuildInfo.java"

# O manifesto guardado no repositório não traz o atributo "package" (o AGP 8
# recusa). O aapt2 precisa dele, então geramos uma cópia só para a compilação.
sed 's|<manifest xmlns:android="http://schemas.android.com/apk/res/android">|<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="br.pessoal.trajetoria">|' \
  "$APP/src/main/AndroidManifest.xml" > "$BUILD/AndroidManifest.xml"
grep -q 'package="br.pessoal.trajetoria"' "$BUILD/AndroidManifest.xml" || { echo "não consegui injetar o package no manifesto"; exit 1; }

echo "== 3/7 recursos (aapt2)"
aapt2 compile --dir "$APP/src/main/res" -o "$BUILD/res.zip"
aapt2 link \
  -o "$BUILD/apk/base.apk" \
  -I "$ANDROID_RES_JAR" \
  --manifest "$BUILD/AndroidManifest.xml" \
  -R "$BUILD/res.zip" \
  --java "$BUILD/gen" \
  --min-sdk-version 26 \
  --target-sdk-version 35 \
  --version-code "$versionCode" \
  --version-name "$versionName" \
  -A "$APP/src/main/assets" \
  --auto-add-overlay

echo "== 4/7 Java (javac, nível 8 para o dx)"
find "$APP/src/main/java" "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
javac -nowarn -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -d "$BUILD/classes" \
  @"$BUILD/sources.txt" 2>&1 | grep -v 'bootstrap class path\|source value 8\|target value 8\|deprecat' || true
[ -f "$BUILD/classes/br/pessoal/trajetoria/MainActivity.class" ] || { echo "javac falhou"; exit 1; }

echo "== 5/7 dex"
java -Xmx1g -cp "$DX" com.android.dx.command.Main --dex --min-sdk-version 26 \
  --output="$BUILD/classes.dex" "$BUILD/classes"

echo "== 6/7 empacotando"
python3 - "$BUILD/apk/base.apk" "$BUILD/classes.dex" "$BUILD/apk/unsigned.apk" <<'PY'
import sys, zipfile, shutil
base, dex, out = sys.argv[1], sys.argv[2], sys.argv[3]
shutil.copy(base, out)
with zipfile.ZipFile(out, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(dex, 'classes.dex')
PY
zipalign -p -f 4 "$BUILD/apk/unsigned.apk" "$BUILD/apk/aligned.apk"

echo "== 7/7 assinando ($VARIANT)"
if [ ! -f "$KEYSTORE" ]; then
  echo "Chave de assinatura ausente em $KEYSTORE."
  echo "Crie uma com tools/make-keystore.sh e guarde-a fora do repositório."
  exit 1
fi
PASS="$(cat "$KEY_PASS_FILE")"
OUT_APK="$ROOT/android/build/trajetoria-$versionName-$VARIANT.apk"
apksigner sign \
  --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT_APK" "$BUILD/apk/aligned.apk"
apksigner verify --print-certs "$OUT_APK"
echo
echo "APK: $OUT_APK"
ls -l "$OUT_APK"

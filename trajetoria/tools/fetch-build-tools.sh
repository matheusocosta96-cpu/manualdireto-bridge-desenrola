#!/usr/bin/env bash
# Baixa o que falta para compilar o APK sem o SDK oficial do Google.
#
# Por que isto existe: dl.google.com (SDK, Build-Tools e o repositório Maven do
# Android) pode estar bloqueado por política de rede. As peças abaixo vêm de
# hosts alternativos e são suficientes para gerar um APK assinado.
#
#   android.jar (API 35 e 34) -> compilar contra a API do Android
#   dx                    -> transformar .class em classes.dex
#
# O resto (aapt2, apksigner, zipalign) vem dos pacotes do sistema:
#   sudo apt-get install -y aapt apksigner zipalign
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$DIR/android/.buildtools"
mkdir -p "$OUT"

# android-35.jar: usado pelo javac (API alvo).
# android-34.jar: usado pelo aapt2 como "-I". O aapt2 do Debian ainda não lê a
# tabela de recursos do android.jar da API 35, e os atributos de que o
# manifesto precisa já existem na 34.
ANDROID_JAR_URL="https://raw.githubusercontent.com/Sable/android-platforms/master/android-35/android.jar"
ANDROID_RES_JAR_URL="https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar"
DX_URL="https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/9.0.0_r3/dalvik-dx-9.0.0_r3.jar"

fetch() {
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then echo "já existe: $dest"; return; fi
  echo "baixando $url"
  curl -fsSL --retry 4 --retry-delay 2 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

fetch "$ANDROID_JAR_URL" "$OUT/android-35.jar"
fetch "$ANDROID_RES_JAR_URL" "$OUT/android-34.jar"
fetch "$DX_URL" "$OUT/dx.jar"

for tool in aapt2 apksigner zipalign keytool javac; do
  command -v "$tool" >/dev/null || { echo "faltando: $tool"; exit 1; }
done
echo "Ferramentas prontas em $OUT"

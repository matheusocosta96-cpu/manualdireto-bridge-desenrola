#!/usr/bin/env bash
# Cria a chave de assinatura do aplicativo. Guarde o arquivo e a senha:
# sem eles o Android não aceita atualizar o aplicativo já instalado — só
# desinstalando, o que apaga os dados locais.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/android/keystore"
mkdir -p "$DIR"
KEYSTORE="$DIR/trajetoria.jks"
PASS_FILE="$DIR/password.txt"
[ -f "$KEYSTORE" ] && { echo "Já existe: $KEYSTORE"; exit 0; }

PASS="${TRAJETORIA_KEY_PASS:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)}"
printf '%s' "$PASS" > "$PASS_FILE"
chmod 600 "$PASS_FILE"

keytool -genkeypair -v \
  -keystore "$KEYSTORE" -storetype PKCS12 \
  -storepass "$PASS" -keypass "$PASS" \
  -alias trajetoria -keyalg RSA -keysize 4096 -validity 10950 \
  -dname "CN=Trajetoria, OU=Pessoal, O=Pessoal, L=-, ST=-, C=BR"

echo
echo "Chave criada: $KEYSTORE"
echo "Senha salva em: $PASS_FILE"
keytool -list -v -keystore "$KEYSTORE" -storepass "$PASS" -alias trajetoria | grep -E "SHA256|Valid"
